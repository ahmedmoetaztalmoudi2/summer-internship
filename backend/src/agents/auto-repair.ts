import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadDotEnv } from '../env.js';
import { analyzeFailure, loadSelectorsFromEnv } from '../failure-analysis/analyzer.js';
import type { FailureAnalysisInput, FailureReport, FailureAnalysisResult } from '../failure-analysis/types.js';
import type { SelectorMap } from '../selector-types.js';
import { applyRepair, computePatch, rollbackRepair, scenarioSlug, type PatchResult } from '../repair-agent/patcher.js';
import { recordRepairEntry, type RepairHistoryEntry } from '../repair-agent/history.js';
import { MAX_REPAIR_ATTEMPTS, runScenario } from '../repair-agent/retry-runner.js';
import { buildRepairPlan, type RepairContext } from '../repair-agent/strategies.js';
import { validateRepair } from '../repair-agent/validator.js';
import type {
  AutoRepairResult,
  RepairAttempt,
  RepairPlan,
  ScenarioAutoRepairOutcome
} from '../repair-agent/types.js';

export interface AutoRepairOptions {
  testDir?: string;
  selectors?: SelectorMap | null;
  outputDir?: string;
  baseUrl?: string;
  maxAttempts?: number;
}

export interface AutoRepairRun {
  result: AutoRepairResult;
  files: { summaryFile: string; historyEntries: string[] };
}

async function loadContextForReport(report: FailureReport, selectors: SelectorMap | null): Promise<RepairContext> {
  const ctx: RepairContext = { report, selectors, testSource: undefined, failingLine: undefined };
  const file = report.location?.file;
  if (!file) {
    return ctx;
  }
  try {
    const testSource = await readFile(file, 'utf8');
    ctx.testSource = testSource;
    if (typeof report.location?.line === 'number') {
      ctx.failingLine = testSource.split(/\r?\n/)[report.location.line - 1];
    }
  } catch {
    // Test source may not exist (offline / stale report).
  }
  return ctx;
}

function formatDuration(durationMs?: number): string {
  return typeof durationMs === 'number' ? `${(durationMs / 1000).toFixed(1)}s` : '?';
}

async function analyzeNewFailure(
  file: string,
  scenario: string,
  error: string | undefined,
  selectors: SelectorMap | null
): Promise<FailureReport> {
  const input: FailureAnalysisInput = {
    scenario,
    status: 'failed',
    error,
    location: { file },
    selectors
  };
  return analyzeFailure(input);
}

async function recordEntry(
  report: FailureReport,
  repairType: string,
  attempt: number,
  result: RepairHistoryEntry['result'],
  before: string | undefined,
  after: string | undefined,
  extra: { error?: string; reason?: string; durationMs?: number; repairedFile?: string; backupFile?: string } = {}
): Promise<string> {
  return recordRepairEntry({
    scenario: report.scenario,
    failureType: report.failureType,
    repairType,
    before,
    after,
    attempt,
    result,
    repairedFile: extra.repairedFile,
    backupFile: extra.backupFile,
    location: report.location,
    appliedAt: new Date().toISOString(),
    durationMs: extra.durationMs,
    error: extra.error,
    reason: extra.reason
  });
}

async function saveFixedVersion(file: string, scenario: string): Promise<void> {
  const fixedDir = path.join(path.resolve('repair-history'), 'fixed');
  await mkdir(fixedDir, { recursive: true });
  const target = path.join(fixedDir, `${scenarioSlug(scenario)}.spec.ts`);
  await copyFile(file, target);
}

async function processScenario(
  report: FailureReport,
  opts: Required<Pick<AutoRepairOptions, 'selectors' | 'testDir'>> & { maxAttempts: number; outputDir?: string },
  historyEntries: string[]
): Promise<ScenarioAutoRepairOutcome> {
  const selectors = opts.selectors;
  const maxAttempts = opts.maxAttempts;
  const outcome: ScenarioAutoRepairOutcome = {
    scenario: report.scenario,
    failureType: report.failureType,
    status: 'escalated',
    attempts: []
  };

  const initialPlan = buildRepairPlan(report, await loadContextForReport(report, selectors));
  outcome.repairType = initialPlan.repairType;

  const firstValidation = await validateRepair(initialPlan, selectors, opts.testDir);
  if (!firstValidation.safe) {
    const reason = `Not auto-repairable: ${firstValidation.reason}`;
    await recordEntry(report, initialPlan.repairType, 0, 'escalated', undefined, undefined, { reason });
    outcome.reason = reason;
    outcome.repairType = initialPlan.repairType;
    return outcome;
  }

  let currentPlan = initialPlan;
  let applied: PatchResult | undefined;
  let backupFile: string | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const attemptRecord: RepairAttempt = {
      attempt,
      repairType: currentPlan.repairType,
      failureType: report.failureType,
      plan: currentPlan,
      result: 'patched'
    };
    outcome.attempts.push(attemptRecord);

    if (!applied) {
      applied = await applyRepair(currentPlan, { attempt, testDir: opts.testDir });
      attemptRecord.backupFile = applied.backupPath;
      attemptRecord.patchedFile = applied.file;
      backupFile = applied.backupPath;

      if (!applied.applied) {
        attemptRecord.result = 'no_change';
        const reason = `Patch not applied: ${applied.error ?? 'no deterministic change'}. Original version restored and escalated.`;
        if (backupFile && applied.file) {
          await rollbackRepair(backupFile, applied.file);
        }
        await recordEntry(report, currentPlan.repairType, attempt, 'failed', applied.before, applied.after, {
          reason,
          error: applied.error,
          repairedFile: applied.file,
          backupFile
        });
        outcome.reason = reason;
        outcome.repairType = currentPlan.repairType;
        return outcome;
      }

      outcome.repairedFile = applied.file;
      console.log(
        `  [${report.scenario}] Attempt ${attempt}: ${currentPlan.repairType} applied (${applied.edits
          .map((edit) => edit.description)
          .join(' ')})`
      );
    } else {
      console.log(`  [${report.scenario}] Attempt ${attempt}: re-running previous patch (${currentPlan.repairType}).`);
    }

    const run = await runScenario(applied.file, report.scenario);
    attemptRecord.durationMs = run.durationMs;
    attemptRecord.result = run.status === 'passed' ? 'success' : 'failed';
    attemptRecord.error = run.error;

    const before = applied.before;
    const after = applied.after;

    if (run.status === 'passed') {
      await recordEntry(report, currentPlan.repairType, attempt, 'success', before, after, {
        durationMs: run.durationMs,
        repairedFile: applied.file,
        backupFile
      });
      await saveFixedVersion(applied.file, report.scenario);
      outcome.status = 'fixed';
      outcome.repairType = currentPlan.repairType;
      outcome.reason = `Fixed after ${attempt} attempt(s) (${formatDuration(run.durationMs)}).`;
      console.log(`  [${report.scenario}] PASSED after repair (attempt ${attempt}). Fix saved.`);
      return outcome;
    }

    await recordEntry(report, currentPlan.repairType, attempt, 'failed', before, after, {
      durationMs: run.durationMs,
      error: run.error,
      repairedFile: applied.file,
      backupFile
    });
    console.log(
      `  [${report.scenario}] Attempt ${attempt} FAILED (${formatDuration(run.durationMs)}). ${run.error?.split('\n')[0] ?? ''}`
    );

    if (attempt >= maxAttempts) {
      const reason = `Still failing after ${attempt} attempt(s). Original version restored and failure escalated for human review.`;
      await rollbackRepair(backupFile, applied.file);
      outcome.reason = reason;
      outcome.repairType = currentPlan.repairType;
      return outcome;
    }

    const newReport = await analyzeNewFailure(applied.file, report.scenario, run.error, selectors);
    const newPlan = buildRepairPlan(newReport, await loadContextForReport(newReport, selectors));

    const nextValidation = await validateRepair(newPlan, selectors, opts.testDir);
    if (!nextValidation.safe) {
      const reason = `Next repair (${newPlan.repairType}) is not auto-safe (${nextValidation.reason}). Original version restored and escalated.`;
      await rollbackRepair(backupFile, applied.file);
      outcome.reason = reason;
      outcome.repairType = newPlan.repairType;
      return outcome;
    }

    // If re-analysis leads to a plan whose patch produces no NEW edits on the
    // current file, the repair is already in place -> re-run it (flakiness
    // guard) instead of re-applying and looping forever.
    const currentContent = await readFile(applied.file, 'utf8');
    const nextPatch = computePatch(newPlan, currentContent);
    if (nextPatch.edits.length === 0) {
      console.log(
        `  [${report.scenario}] Re-analysis: ${newPlan.failureType} -> ${newPlan.repairType} (no new changes). Re-running same patch (flakiness guard).`
      );
    } else {
      console.log(`  [${report.scenario}] Re-analysis: ${newPlan.failureType} -> ${newPlan.repairType}. Applying next patch.`);
      currentPlan = newPlan;
      applied = undefined; // next loop iteration applies the new plan on top of the current file
    }
  }

  const reason = `Still failing after ${maxAttempts} attempt(s). Original version restored and failure escalated for human review.`;
  if (applied) {
    await rollbackRepair(backupFile, applied.file);
  }
  outcome.reason = reason;
  return outcome;
}

/**
 * Auto-Repair Agent entry point.
 *
 * For every failed scenario it:
 *  1. regenerates the repair plan,
 *  2. validates that the repair is safe to auto-apply,
 *  3. backs up + patches the test file (deterministic, KB-grounded),
 *  4. re-runs the single scenario,
 *  5. saves the fix (history + fixed/ copy) on success,
 *  6. rolls back and escalates when it still fails.
 *
 * NEVER deletes tests, touches Jira or production, or applies more than one
 * strategy per attempt.
 */
export async function autoRepairAndRetry(
  reports: FailureReport[],
  options: AutoRepairOptions = {}
): Promise<AutoRepairRun> {
  loadDotEnv();

  const selectors = options.selectors ?? loadSelectorsFromEnv(options.baseUrl);
  const maxAttempts = options.maxAttempts ?? MAX_REPAIR_ATTEMPTS;
  const historyEntries: string[] = [];
  const totalMs = Date.now();

  console.log('========================================================');
  console.log('   AUTO-REPAIR AGENT (deterministic patch + retry)');
  console.log('========================================================\n');

  const outcomes: ScenarioAutoRepairOutcome[] = [];
  for (const report of reports) {
    outcomes.push(
      await processScenario(report, { selectors, testDir: options.testDir ?? path.resolve('tests/generated'), maxAttempts }, historyEntries)
    );
  }

  const fixed = outcomes.filter((outcome) => outcome.status === 'fixed').length;
  const escalated = outcomes.filter((outcome) => outcome.status === 'escalated').length;
  const skipped = outcomes.filter((outcome) => outcome.status === 'skipped').length;

  const result: AutoRepairResult = {
    analyzedAt: new Date().toISOString(),
    total: reports.length,
    fixed,
    escalated,
    skipped,
    outcomes,
    summaryFile: path.join(options.outputDir ?? 'repair-reports', 'auto-repair-report.json')
  };

  const summaryFile = path.join(options.outputDir ?? path.resolve('repair-reports'), 'auto-repair-report.json');
  await mkdir(path.dirname(summaryFile), { recursive: true });
  await writeFile(summaryFile, `${JSON.stringify(result, null, 2)}\n`, 'utf8');

  console.log(`\nRepair loop finished in ${((Date.now() - totalMs) / 1000).toFixed(1)}s:`);
  console.log(`  fixed: ${fixed}   escalated: ${escalated}   skipped: ${skipped}`);
  console.log(`Summary written to: ${summaryFile}`);
  console.log(`Repair history: ${path.resolve('repair-history')}`);

  return { result, files: { summaryFile, historyEntries } };
}

function formatOutcome(outcome: ScenarioAutoRepairOutcome): string {
  const header = `${outcome.scenario}\n  status: ${outcome.status} (${outcome.failureType} -> ${outcome.repairType ?? '-'})`;
  const attempts = outcome.attempts
    .map((attempt) => `    attempt ${attempt.attempt}: ${attempt.result} (${attempt.repairType}, ${formatDuration(attempt.durationMs)})`)
    .join('\n');
  const reason = outcome.reason ? `  reason: ${outcome.reason}` : '';
  const repaired = outcome.repairedFile ? `  patched file: ${outcome.repairedFile}` : '';
  return [header, attempts, reason, repaired].filter(Boolean).join('\n');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const reportArg = args.find((arg) => arg.startsWith('--report='));
  const reportPath = reportArg ? reportArg.split('=')[1] : path.join(path.resolve('failure-reports'), 'failure-report.json');

  const parsed = JSON.parse(await readFile(reportPath, 'utf8')) as FailureAnalysisResult;
  const { result } = await autoRepairAndRetry(parsed.reports, {
    testDir: path.resolve('tests/generated'),
    outputDir: path.resolve('repair-reports')
  });

  console.log('\n--------------------------------------------------------');
  for (const outcome of result.outcomes) {
    console.log(`\n${formatOutcome(outcome)}`);
  }
  console.log('\n========================================================');
}

if (require.main === module) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    console.error('[auto-repair] Fatal error:', message);
    process.exitCode = 1;
  });
}
