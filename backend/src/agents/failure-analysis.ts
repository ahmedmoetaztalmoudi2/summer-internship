import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { loadDotEnv } from '../env.js';
import { analyzeFailure, loadSelectorsFromEnv } from '../failure-analysis/analyzer.js';
import { writeFailureReports } from '../failure-analysis/report.js';
import type { FailureAnalysisInput, FailureAnalysisResult, FailureReport, FailureStatus } from '../failure-analysis/types.js';
import type { JsonReport } from '../reporter.js';
import type { SelectorMap } from '../selector-types.js';

interface PlaywrightAttachment {
  name?: string;
  path?: string;
}

interface PlaywrightError {
  message?: string;
  stack?: string;
  location?: { file?: string; line?: number; column?: number };
  snippet?: string;
}

interface PlaywrightResult {
  status?: string;
  duration?: number;
  retry?: number;
  error?: PlaywrightError;
  errors?: PlaywrightError[];
  attachments?: PlaywrightAttachment[];
  errorLocation?: { file?: string; line?: number; column?: number };
}

interface PlaywrightTest {
  results?: PlaywrightResult[];
}

interface PlaywrightSpec {
  title?: string;
  ok?: boolean;
  tests?: PlaywrightTest[];
}

interface PlaywrightSuite {
  title?: string;
  file?: string;
  suites?: PlaywrightSuite[];
  specs?: PlaywrightSpec[];
}

interface PlaywrightRawReport {
  suites?: PlaywrightSuite[];
  stats?: { expected?: number; unexpected?: number; skipped?: number; flaky?: number; duration?: number };
}

function normalizeStatus(rawStatus: string | undefined): FailureStatus {
  return rawStatus === 'passed' ? 'passed' : 'failed';
}

function toErrorMessage(error: PlaywrightError | undefined): string | undefined {
  if (!error) {
    return undefined;
  }
  const parts = [error.message, error.stack].filter((part): part is string => Boolean(part && part !== error.message));
  return [error.message, ...parts].filter(Boolean).join('\n');
}

function collectErrorText(result: PlaywrightResult): string | undefined {
  const parts: string[] = [];

  if (result.error) {
    parts.push(result.error.message ?? '');
    if (result.error.stack && result.error.stack !== result.error.message) {
      parts.push(result.error.stack);
    }
  }

  for (const error of result.errors ?? []) {
    if (error.message) {
      parts.push(error.message);
    }
    if (error.snippet) {
      parts.push(error.snippet);
    }
  }

  const joined = parts.filter(Boolean).join('\n');
  return joined ? joined.slice(0, 60000) : undefined;
}

/**
 * Deep-walks the raw Playwright JSON reporter output and normalizes every
 * executed test into the input shape the Failure Analysis Agent expects.
 */
export function extractFailureInputsFromRaw(raw: PlaywrightRawReport): FailureAnalysisInput[] {
  const inputs: FailureAnalysisInput[] = [];

  const visitSuite = (suite: PlaywrightSuite): void => {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        for (const result of test.results ?? []) {
          const status = normalizeStatus(result.status);
          const errorText = collectErrorText(result);
          const errorLocation =
            result.error?.location ?? result.errorLocation ?? result.errors?.find((e) => e.location)?.location;

          const attachments = (result.attachments ?? [])
            .map((attachment) => attachment.path)
            .filter((p): p is string => Boolean(p));

          inputs.push({
            scenario: spec.title?.trim() || 'Generated scenario',
            status,
            error: errorText,
            location: errorLocation,
            durationMs: result.duration,
            retry: result.retry,
            attachments,
            selectors: undefined
          });
        }
      }
    }

    for (const child of suite.suites ?? []) {
      visitSuite(child);
    }
  };

  for (const suite of raw.suites ?? []) {
    visitSuite(suite);
  }

  return inputs;
}

/** Normalizes the flattened JSON report (report.json without rich `raw`). */
export function extractFailureInputsFromJsonReport(report: JsonReport): FailureAnalysisInput[] {
  return report.details.map((detail) => ({
    scenario: detail.test,
    status: detail.status,
    error: detail.error
  }));
}

function selectorsFor(inputs: FailureAnalysisInput[], selectors: SelectorMap | null): FailureAnalysisInput[] {
  if (!selectors) {
    return inputs;
  }
  return inputs.map((input) => ({ ...input, selectors }));
}

/**
 * Loads the generated test source for every input that references a file, so
 * the agent can cross-check the failing line against the actual test code
 * (e.g. to spot unsubstituted placeholders that the error message may not show).
 */
async function attachTestSources(
  inputs: FailureAnalysisInput[],
  testDir?: string
): Promise<FailureAnalysisInput[]> {
  return Promise.all(
    inputs.map(async (input) => {
      const filePath = input.location?.file ?? (testDir ? null : null);
      if (!filePath || typeof filePath !== 'string') {
        return input;
      }
      try {
        const testSource = await readFile(filePath, 'utf8');
        return { ...input, testSource };
      } catch {
        return input;
      }
    })
  );
}

export interface FailureAnalysisOptions {
  testDir?: string;
  selectors?: SelectorMap | null;
  outputDir?: string;
  baseUrl?: string;
}

export interface FailureAnalysisRun {
  result: FailureAnalysisResult;
  files: { summaryFile: string; scenarioFiles: string[] };
}

/**
 * Failure Analysis Agent entry point.
 *
 * Takes the execution summary (flattened JsonReport + optional rich Playwright
 * raw output), classifies every failed scenario and persists structured
 * diagnostic reports BEFORE any repair logic is introduced.
 */
export async function analyzeFailures(
  report: JsonReport,
  options: FailureAnalysisOptions = {}
): Promise<FailureAnalysisRun> {
  loadDotEnv();

  const selectors = options.selectors ?? loadSelectorsFromEnv(options.baseUrl);

  const raw = (report as JsonReport & { raw?: unknown }).raw;
  let inputs: FailureAnalysisInput[];
  if (raw && typeof raw === 'object') {
    inputs = extractFailureInputsFromRaw(raw as PlaywrightRawReport);
  } else {
    inputs = extractFailureInputsFromJsonReport(report);
  }

  inputs = selectorsFor(inputs, selectors);
  inputs = await attachTestSources(inputs, options.testDir);

  const failedInputs = inputs.filter((input) => input.status === 'failed');
  const reports: FailureReport[] = failedInputs.map((input) => analyzeFailure(input));

  const result: FailureAnalysisResult = {
    analyzedAt: new Date().toISOString(),
    total: report.total ?? inputs.length,
    passed: report.passed ?? inputs.filter((input) => input.status === 'passed').length,
    failed: report.failed ?? failedInputs.length,
    reports,
    summaryFile: path.join(options.outputDir ?? 'failure-reports', 'failure-report.json')
  };

  const files = await writeFailureReports(result, options.outputDir);

  return { result, files };
}

export function formatReport(report: FailureReport): string {
  const confidence = `${(report.confidence * 100).toFixed(0)}%`;
  return `${report.scenario}\n  ${report.failureType} (confidence: ${confidence})\n  root cause: ${report.rootCause}\n  recommendation: ${report.repairRecommendation}`;
}

/**
 * Converts a structured failure report into a concise, human-readable paragraph
 * that explains the problem and the fix without exposing internal field names.
 * Used to surface a plain-language "what went wrong / how to fix it" note next
 * to each failed scenario in the final report.
 */
export function formatFailureParagraph(report: FailureReport): string {
  const confidence = `${(report.confidence * 100).toFixed(0)}%`;
  const lines = [`FAILED SCENARIO: ${report.scenario}`];
  lines.push(`  What happened: ${report.rootCause}`);
  lines.push(`  Likely because: ${report.failureType} (confidence ${confidence})`);
  lines.push(`  Suggested fix: ${report.repairRecommendation}`);
  return lines.join('\n');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const reportArg = args.find((arg) => arg.startsWith('--report='));
  const reportPath = reportArg ? reportArg.split('=')[1] : path.resolve('report.json');

  const parsed = JSON.parse(await readFile(reportPath, 'utf8')) as JsonReport;
  const { result, files } = await analyzeFailures(parsed, {
    testDir: path.resolve('tests/generated'),
    outputDir: path.resolve('failure-reports')
  });

  console.log('========================================================');
  console.log('   FAILURE ANALYSIS AGENT');
  console.log('========================================================\n');
  console.log(`Analyzed ${result.total} test(s): ${result.passed} passed, ${result.failed} failed.`);
  console.log(`Reports written to: ${files.summaryFile}`);
  console.log(`  ${files.scenarioFiles.length} scenario file(s):`);
  for (const file of files.scenarioFiles) {
    console.log(`  - ${file}`);
  }
  console.log('\n--------------------------------------------------------');
  for (const report of result.reports) {
    console.log(`\n${formatReport(report)}`);
  }
  console.log('\n========================================================');
}

if (require.main === module) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    console.error('[failure-analysis] Fatal error:', message);
    process.exitCode = 1;
  });
}
