import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { RepairPlan, RepairProposalResult } from './types.js';

export function repairReportsDirectory(): string {
  return path.resolve('repair-reports');
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
 * Persists the repair proposals:
 *  - repair-reports/repair-report.json  -> summary + all plans
 *  - repair-reports/<scenario-slug>.json -> one plan per scenario
 */
export async function writeRepairReports(
  result: RepairProposalResult,
  outputDir: string = repairReportsDirectory()
): Promise<{ summaryFile: string; planFiles: string[] }> {
  await mkdir(outputDir, { recursive: true });

  const summaryFile = path.join(outputDir, 'repair-report.json');
  await writeFile(summaryFile, serialize(result), 'utf8');

  const planFiles: string[] = [];
  for (const plan of result.plans) {
    const slug = slugify(plan.scenario) || 'scenario';
    const filePath = path.join(outputDir, `${slug}.json`);
    await writeFile(filePath, serialize(plan), 'utf8');
    planFiles.push(filePath);
  }

  return { summaryFile, planFiles };
}

export function isValidRepairPlan(plan: RepairPlan): boolean {
  return (
    typeof plan.scenario === 'string' &&
    typeof plan.repairType === 'string' &&
    typeof plan.confidence === 'number' &&
    plan.confidence >= 0 &&
    plan.confidence <= 1 &&
    typeof plan.repairable === 'boolean' &&
    Array.isArray(plan.actions) &&
    Array.isArray(plan.explanation)
  );
}
