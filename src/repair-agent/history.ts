import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { FailureCategory, FailureLocation } from '../failure-analysis/types.js';
import type { RepairAttemptResult, RepairType } from './types.js';

export type RepairHistoryResult = RepairAttemptResult | 'escalated';

/**
 * One auditable repair-history record. Enables future learning: each attempt
 * stores the before/after test source plus the outcome so a future agent can
 * mine which repairs actually fixed which failures.
 */
export interface RepairHistoryEntry {
  scenario: string;
  failureType: FailureCategory | string;
  repairType: RepairType | string;
  /** Original test source (before any repair attempt). */
  before?: string;
  /** Test source after the applied patch. */
  after?: string;
  attempt: number;
  result: RepairHistoryResult;
  repairedFile?: string;
  backupFile?: string;
  location?: FailureLocation;
  appliedAt: string;
  durationMs?: number;
  error?: string;
  reason?: string;
}

export function repairHistoryDirectory(): string {
  return path.resolve('repair-history');
}

function historyLogPath(): string {
  return path.join(repairHistoryDirectory(), 'history.json');
}

/** Loads the append-only repair history (empty array when none exists yet). */
export async function loadRepairHistory(): Promise<RepairHistoryEntry[]> {
  try {
    const content = await readFile(historyLogPath(), 'utf8');
    const parsed = JSON.parse(content) as unknown;
    return Array.isArray(parsed) ? (parsed as RepairHistoryEntry[]) : [];
  } catch {
    return [];
  }
}

/**
 * Persists one repair-history entry:
 *  - appends to repair-history/history.json;
 *  - writes a per-attempt file repair-history/<scenario-slug>-attempt-<n>.json.
 * Returns the per-entry file path.
 */
export async function recordRepairEntry(entry: RepairHistoryEntry): Promise<string> {
  const directory = repairHistoryDirectory();
  await mkdir(directory, { recursive: true });

  const slug = entry.scenario
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

  const entryFile = path.join(directory, `${slug}-attempt-${entry.attempt}.json`);
  await writeFile(entryFile, `${JSON.stringify(entry, null, 2)}\n`, 'utf8');

  const history = await loadRepairHistory();
  history.push(entry);
  await writeFile(historyLogPath(), `${JSON.stringify(history, null, 2)}\n`, 'utf8');

  return entryFile;
}
