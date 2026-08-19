import type { SelectorMap } from '../selector-types.js';

/**
 * The 12 failure categories the Failure Analysis Agent can assign to a failed
 * scenario. Each maps to a distinct class of evidence found in Playwright
 * error output.
 */
export type FailureCategory =
  | 'selector_not_found'
  | 'strict_mode_violation'
  | 'visibility_issue'
  | 'timeout'
  | 'assertion_failure'
  | 'navigation_failure'
  | 'authentication_failure'
  | 'data_issue'
  | 'unsupported_interaction'
  | 'application_bug'
  | 'flaky_test'
  | 'unknown';

export const FAILURE_CATEGORIES: readonly FailureCategory[] = [
  'selector_not_found',
  'strict_mode_violation',
  'visibility_issue',
  'timeout',
  'assertion_failure',
  'navigation_failure',
  'authentication_failure',
  'data_issue',
  'unsupported_interaction',
  'application_bug',
  'flaky_test',
  'unknown'
];

/**
 * The five "root cause dimensions" the agent must distinguish, plus two
 * supporting values:
 *  - assertion_logic: the assertion itself is wrong / too strict
 *  - unknown: not enough evidence
 */
export type RootCause =
  | 'bad_selector'
  | 'bad_test_data'
  | 'application_behavior'
  | 'environment_issue'
  | 'timing_issue'
  | 'assertion_logic'
  | 'unknown';

export const ROOT_CAUSES: readonly RootCause[] = [
  'bad_selector',
  'bad_test_data',
  'application_behavior',
  'environment_issue',
  'timing_issue',
  'assertion_logic',
  'unknown'
];

export type FailureStatus = 'failed' | 'passed';

export interface FailureLocation {
  file?: string;
  line?: number;
  column?: number;
}

/** A single auditable piece of evidence used to justify a classification. */
export interface FailureEvidence {
  source: string;
  content: string;
}

/**
 * Everything the Failure Analysis Agent needs about one failed test.
 * `testSource` and `selectors` are context (not serialized into the report).
 */
export interface FailureAnalysisInput {
  scenario: string;
  status: FailureStatus;
  error?: string;
  location?: FailureLocation;
  durationMs?: number;
  retry?: number;
  attachments?: string[];
  testSource?: string;
  selectors?: SelectorMap | null;
}

/**
 * Structured analysis context extracted from the failure evidence. The Repair
 * Agent consumes these fields to build deterministic, evidence-based repair
 * plans without re-parsing raw error text.
 */
export interface FailureDiagnostics {
  failingLocator?: string;
  locatorLines: string[];
  placeholders: string[];
  knownSelectorKeys: string[];
  unknownOptionTexts: string[];
}

/**
 * The structured diagnostic report produced for a single failed scenario.
 * `scenario`, `status`, `failureType`, `confidence`, `rootCause` and
 * `repairRecommendation` are the required contract fields; the rest enrich
 * the report with reasoning and evidence.
 */
export interface FailureReport {
  scenario: string;
  status: FailureStatus;
  failureType: FailureCategory;
  confidence: number;
  rootCause: RootCause;
  repairRecommendation: string;
  reasoning: string[];
  evidence: FailureEvidence[];
  errorSummary?: string;
  location?: FailureLocation;
  diagnostics?: FailureDiagnostics;
  analyzedAt: string;
}

export interface FailureAnalysisResult {
  analyzedAt: string;
  total: number;
  passed: number;
  failed: number;
  reports: FailureReport[];
  summaryFile: string;
}
