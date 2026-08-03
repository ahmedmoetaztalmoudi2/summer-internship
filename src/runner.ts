import { exec } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { loadDotEnv } from './env.js';

const execAsync = promisify(exec);

export type TestStatus = 'passed' | 'failed';

export interface TestExecutionDetail {
  test: string;
  status: TestStatus;
  error?: string;
}

export interface TestRunSummary {
  total: number;
  passed: number;
  failed: number;
  details: TestExecutionDetail[];
  raw?: unknown;
}

interface PlaywrightJsonResult {
  suites?: unknown[];
  stats?: {
    expected?: number;
    unexpected?: number;
    skipped?: number;
    flaky?: number;
    duration?: number;
  };
}

function toErrorMessage(value: unknown): string | undefined {
  if (!value) {
    return undefined;
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'object' && value !== null) {
    const message = 'message' in value ? (value as { message?: unknown }).message : undefined;
    const stack = 'stack' in value ? (value as { stack?: unknown }).stack : undefined;

    if (typeof message === 'string' && typeof stack === 'string') {
      return `${message}\n${stack}`;
    }

    if (typeof message === 'string') {
      return message;
    }

    if (typeof stack === 'string') {
      return stack;
    }
  }

  return String(value);
}

function parsePlaywrightOutput(stdout: string): PlaywrightJsonResult | undefined {
  const trimmed = stdout.trim();
  if (!trimmed) {
    return undefined;
  }

  try {
    return JSON.parse(trimmed) as PlaywrightJsonResult;
  } catch {
    return undefined;
  }
}

function collectTestDetails(report: PlaywrightJsonResult): TestExecutionDetail[] {
  const details: TestExecutionDetail[] = [];

  const visitSuite = (suite: any): void => {
    if (!suite || typeof suite !== 'object') {
      return;
    }

    const specs = Array.isArray(suite.specs) ? suite.specs : [];
    for (const spec of specs) {
      const specTitle = typeof spec?.title === 'string' && spec.title.trim() ? spec.title.trim() : 'Generated scenario';
      const tests = Array.isArray(spec?.tests) ? spec.tests : [];

      if (tests.length === 0) {
        details.push({
          test: specTitle,
          status: spec?.ok === false ? 'failed' : 'passed',
          error: spec?.ok === false ? toErrorMessage(spec?.error) : undefined
        });
        continue;
      }

      for (const test of tests) {
        const results = Array.isArray(test?.results) ? test.results : [];
        const firstResult = results[0];
        const status = firstResult?.status === 'passed' ? 'passed' : 'failed';
        const error = status === 'failed' ? toErrorMessage(firstResult?.error) ?? toErrorMessage(test?.error) ?? toErrorMessage(spec?.error) : undefined;

        details.push({
          test: specTitle,
          status,
          error
        });
      }
    }

    const childSuites = Array.isArray(suite.suites) ? suite.suites : [];
    for (const childSuite of childSuites) {
      visitSuite(childSuite);
    }
  };

  for (const suite of report.suites ?? []) {
    visitSuite(suite);
  }

  return details;
}

function buildFailureFallback(stderrText: string, stdoutText: string): TestRunSummary {
  const message = stderrText.trim() || stdoutText.trim() || 'Playwright test execution failed.';
  return {
    total: 1,
    passed: 0,
    failed: 1,
    details: [
      {
        test: 'Generated Playwright suite',
        status: 'failed',
        error: message
      }
    ]
  };
}

export async function runGeneratedTests(testDir: string): Promise<TestRunSummary> {
  loadDotEnv();

  const relativeTestDir = path.relative(process.cwd(), testDir).replace(/\\/g, '/');
  const command = `npx playwright test "${relativeTestDir}" --reporter=json`;

  try {
    const { stdout } = await execAsync(command, {
      maxBuffer: 20 * 1024 * 1024
    });

    const report = parsePlaywrightOutput(stdout);
    if (!report) {
      return buildFailureFallback('', stdout);
    }

    const details = collectTestDetails(report);
    const passed = details.filter((detail) => detail.status === 'passed').length;
    const failed = details.filter((detail) => detail.status === 'failed').length;

    return {
      total: details.length,
      passed,
      failed,
      details,
      raw: report
    };
  } catch (error) {
    const caughtError = error as {
      stdout?: string | Buffer;
      stderr?: string | Buffer;
      message?: string;
    };

    const stdoutText = typeof caughtError.stdout === 'string' ? caughtError.stdout : caughtError.stdout?.toString() ?? '';
    const stderrText = typeof caughtError.stderr === 'string' ? caughtError.stderr : caughtError.stderr?.toString() ?? caughtError.message ?? '';
    const report = parsePlaywrightOutput(stdoutText);

    if (report) {
      const details = collectTestDetails(report);
      const passed = details.filter((detail) => detail.status === 'passed').length;
      const failed = details.filter((detail) => detail.status === 'failed').length;

      return {
        total: details.length,
        passed,
        failed,
        details,
        raw: report
      };
    }

    return buildFailureFallback(stderrText, stdoutText);
  }
}
