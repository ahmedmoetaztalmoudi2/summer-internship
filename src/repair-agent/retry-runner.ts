import { exec } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { loadDotEnv } from '../env.js';

const execAsync = promisify(exec);

/** Maximum automatic repair attempts per scenario before escalation. */
export const MAX_REPAIR_ATTEMPTS = 3;

export interface ScenarioRunResult {
  scenario: string;
  status: 'passed' | 'failed';
  durationMs?: number;
  error?: string;
}

interface RawSpec {
  title?: string;
  ok?: boolean;
  tests?: { results?: { status?: string; duration?: number; error?: { message?: string; stack?: string } }[] }[];
}

function errorText(error: { message?: string; stack?: string } | undefined): string | undefined {
  if (!error) {
    return undefined;
  }
  const message = error.message ?? '';
  const stack = error.stack ?? '';
  if (stack && stack !== message) {
    return `${message}\n${stack}`;
  }
  return message || undefined;
}

/**
 * Runs a SINGLE Playwright test file and returns the result of the scenario
 * that matches `scenario` by exact title.
 *
 * NOTE: we deliberately do NOT use `--grep` here — passing accented scenario
 * titles through the Windows shell corrupts them. Running the (already small)
 * generated file and matching the parsed JSON is deterministic and portable.
 */
export async function runScenario(testFile: string, scenario: string): Promise<ScenarioRunResult> {
  loadDotEnv();

  // Playwright treats positional args as regex filters against the ROOT-relative
  // test path, so an absolute Windows path ("C:\...") never matches. Use the
  // cwd-relative path with forward slashes (same approach as src/runner.ts).
  const relativeTestFile = path.relative(process.cwd(), testFile).replace(/\\/g, '/');
  const command = `npx playwright test "${relativeTestFile}" --reporter=json`;

  let stdout = '';
  let stderr = '';
  try {
    const result = await execAsync(command, { maxBuffer: 20 * 1024 * 1024 });
    stdout = result.stdout;
  } catch (error) {
    const caught = error as { stdout?: string | Buffer; stderr?: string | Buffer; code?: number | string };
    stdout = typeof caught.stdout === 'string' ? caught.stdout : caught.stdout?.toString() ?? '';
    stderr = typeof caught.stderr === 'string' ? caught.stderr : caught.stderr?.toString() ?? '';
  }

  let report: { suites?: { title?: string; suites?: unknown[]; specs?: RawSpec[] }[]; errors?: { message?: string }[] } | undefined;
  try {
    report = JSON.parse(stdout.trim()) as typeof report;
  } catch {
    report = undefined;
  }

  if (!report) {
    return {
      scenario,
      status: 'failed',
      error: stderr.trim() || stdout.trim() || 'Playwright produced no parseable output.'
    };
  }

  const collectionErrors = (report.errors ?? []).map((error) => error.message).filter(Boolean);
  const match: RawSpec | undefined = findSpec(report.suites, scenario);

  if (!match) {
    return {
      scenario,
      status: 'failed',
      error:
        (collectionErrors.length > 0 ? collectionErrors.join('\n') : '') ||
        `Could not find scenario "${scenario}" in the Playwright report.`
    };
  }

  const first = match.tests?.[0]?.results?.[0];
  const passed = first?.status === 'passed';
  return {
    scenario,
    status: passed ? 'passed' : 'failed',
    durationMs: first?.duration,
    error: passed ? undefined : errorText(first?.error)
  };
}

function findSpec(
  suites: { title?: string; suites?: unknown[]; specs?: RawSpec[] }[] | undefined,
  scenario: string
): RawSpec | undefined {
  for (const suite of suites ?? []) {
    const direct = suite.specs?.find((spec) => spec.title?.trim() === scenario);
    if (direct) {
      return direct;
    }
    const nested = findSpec(suite.suites as { title?: string; suites?: unknown[]; specs?: RawSpec[] }[] | undefined, scenario);
    if (nested) {
      return nested;
    }
  }
  return undefined;
}
