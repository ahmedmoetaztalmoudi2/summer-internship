import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { FailureAnalysisResult } from './types.js';

export function failureReportsDirectory(): string {
  return path.resolve('failure-reports');
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function serialize(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/**
 * Persists the failure analysis:
 *  - failure-reports/failure-report.json   -> combined summary + all reports
 *  - failure-reports/<scenario-slug>.json  -> one file per analyzed scenario
 * Returns the paths written.
 */
export async function writeFailureReports(
  result: FailureAnalysisResult,
  outputDir: string = failureReportsDirectory()
): Promise<{ summaryFile: string; scenarioFiles: string[] }> {
  await mkdir(outputDir, { recursive: true });

  const summaryFile = path.join(outputDir, 'failure-report.json');
  await writeFile(summaryFile, serialize(result), 'utf8');

  const scenarioFiles: string[] = [];
  for (const report of result.reports) {
    const slug = slugify(report.scenario) || 'scenario';
    const filePath = path.join(outputDir, `${slug}.json`);
    await writeFile(filePath, serialize(report), 'utf8');
    scenarioFiles.push(filePath);
  }

  return { summaryFile, scenarioFiles };
}
