import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { TestRunSummary } from './runner.js';

export interface JsonReportDetail {
  test: string;
  status: 'passed' | 'failed';
  error?: string;
}

export interface JsonReport {
  total: number;
  passed: number;
  failed: number;
  details: JsonReportDetail[];
}

export function createReport(summary: TestRunSummary): JsonReport {
  return {
    total: summary.total,
    passed: summary.passed,
    failed: summary.failed,
    details: summary.details.map((detail) => ({
      test: detail.test,
      status: detail.status,
      error: detail.error
    }))
  };
}

export async function writeReport(report: JsonReport, filePath: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}
