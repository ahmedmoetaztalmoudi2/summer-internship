import type { FailureCategory, RootCause } from '../failure-analysis/types.js';

/**
 * The deterministic repair strategies the Repair Agent can propose. Each maps
 * to one or more concrete, evidence-driven edits; the agent never invents free
 * LLM rewrites.
 */
export type RepairType =
  | 'replace_selector'
  | 'disambiguate_selector'
  | 'use_choices_wrapper'
  | 'add_visibility_guard'
  | 'increase_timeout'
  | 'add_wait_strategy'
  | 'fix_navigation_url'
  | 'ensure_credentials'
  | 'fix_examples_table'
  | 'replace_test_data'
  | 'correct_interaction'
  | 'update_expected_value'
  | 'stabilize_flaky_test'
  | 'manual_review'
  | 'no_repair';

export const REPAIR_TYPES: readonly RepairType[] = [
  'replace_selector',
  'disambiguate_selector',
  'use_choices_wrapper',
  'add_visibility_guard',
  'increase_timeout',
  'add_wait_strategy',
  'fix_navigation_url',
  'ensure_credentials',
  'fix_examples_table',
  'replace_test_data',
  'correct_interaction',
  'update_expected_value',
  'stabilize_flaky_test',
  'manual_review',
  'no_repair'
];

/**
 * A single concrete edit step. `file`/`line` pin the change to the generated
 * test source when known; `currentValue`/`replacementValue` describe the exact
 * before/after for the edit.
 */
export interface RepairAction {
  action: string;
  file?: string;
  line?: number;
  currentValue?: string;
  replacementValue?: string;
}

/**
 * The RepairPlan produced for one failed scenario. It explains exactly what
 * should change and how confident the agent is that the change fixes the
 * failure. It NEVER applies the change.
 *
 * The top-level fields `repairType`, `target`, `currentValue`,
 * `replacementValue` and `confidence` follow the required contract.
 */
export interface RepairPlan {
  scenario: string;
  failureType: FailureCategory;
  rootCause: RootCause;
  repairType: RepairType;
  target: string;
  currentValue?: string;
  replacementValue?: string;
  /** 0..1 — how confident the repair will actually fix the failure. */
  confidence: number;
  /** False when the plan only documents the issue (app bug, unknown, missing data). */
  repairable: boolean;
  /** True when a human must confirm the exact change before it is applied. */
  requiresHumanReview: boolean;
  actions: RepairAction[];
  explanation: string[];
  sourceFile?: string;
  generatedFrom?: string;
}

export interface RepairProposalResult {
  analyzedAt: string;
  total: number;
  repairable: number;
  manual: number;
  plans: RepairPlan[];
  summaryFile: string;
}

/** Outcome of one repair attempt inside the auto-repair loop. */
export type RepairAttemptResult = 'patched' | 'success' | 'failed' | 'escalated' | 'no_change';

/** The lifecycle status of a scenario after the auto-repair loop finishes. */
export type AutoRepairStatus = 'fixed' | 'escalated' | 'skipped';

export interface RepairAttempt {
  attempt: number;
  repairType: RepairType;
  failureType: string;
  plan: RepairPlan;
  result: RepairAttemptResult;
  /** Absolute path of the patch backup (rollback source). */
  backupFile?: string;
  patchedFile?: string;
  error?: string;
  durationMs?: number;
}

export interface ScenarioAutoRepairOutcome {
  scenario: string;
  failureType: string;
  status: AutoRepairStatus;
  reason?: string;
  repairType?: RepairType;
  attempts: RepairAttempt[];
  repairedFile?: string;
}

export interface AutoRepairResult {
  analyzedAt: string;
  total: number;
  fixed: number;
  escalated: number;
  skipped: number;
  outcomes: ScenarioAutoRepairOutcome[];
  summaryFile: string;
}
