/**
 * Domain types shared between the API layer and the UI.
 * These mirror the backend contract — adjust here when the backend evolves.
 */

export type PipelineStageId =
  | "jira_analysis"
  | "acceptance_criteria"
  | "gherkin_generation"
  | "selector_verification"
  | "playwright_generation"
  | "test_execution"
  | "failure_analysis"
  | "repair";

export type StageStatus = "waiting" | "running" | "completed" | "failed" | "skipped";

export interface PipelineStage {
  id: PipelineStageId;
  label: string;
  shortLabel: string;
  status: StageStatus;
  detail?: string | undefined;
}

export type RunStatus =
  | "pending"
  | "awaiting_input"
  | "running"
  | "completed"
  | "failed";

/** Field descriptor returned by the backend when more information is required. */
export type InputFieldType =
  | "text"
  | "email"
  | "password"
  | "url"
  | "number"
  | "textarea"
  | "select";

export interface RequiredInputField {
  name: string;
  label: string;
  type: InputFieldType;
  required?: boolean;
  placeholder?: string;
  description?: string;
  /** For type === "select" */
  options?: { label: string; value: string }[];
}

export interface RequiredInput {
  requiresInput: boolean;
  message?: string | undefined;
  fields: RequiredInputField[];
}

export interface StartTestRequest {
  ticket: string;
  websiteUrl: string;
  jiraCredentials?: { domain?: string; email?: string; apiToken?: string } | undefined;
}

export interface StartTestResponse {
  runId: string;
  status: RunStatus;
  requiresInput?: boolean | undefined;
  message?: string | undefined;
  fields?: RequiredInputField[] | undefined;
}

export interface RunStatusResponse {
  runId: string;
  ticket: string;
  websiteUrl: string;
  status: RunStatus;
  stages: PipelineStage[];
  requiresInput?: boolean | undefined;
  message?: string | undefined;
  fields?: RequiredInputField[] | undefined;
  error?: string | undefined;
}

export type TestStatus = "passed" | "failed" | "skipped";

export interface FailureDetails {
  category: string;
  message: string;
  failedStep?: string;
  selector?: string;
  analysis?: string;
}

export interface RepairDetails {
  status: "proposed" | "applied" | "failed" | "not_attempted";
  proposal?: string;
  appliedCode?: string;
}

export interface TestCaseResult {
  id: string;
  name: string;
  status: TestStatus;
  durationMs?: number;
  failure?: FailureDetails;
  repair?: RepairDetails;
}

export interface TestSummaryData {
  total: number;
  passed: number;
  failed: number;
  skipped?: number;
  passRate: number;
  executionTimeMs: number;
}

export interface RunResults {
  runId: string;
  ticket: string;
  websiteUrl: string;
  summary: TestSummaryData;
  tests: TestCaseResult[];
  gherkin: string;
  playwrightCode: string;
}

/** Normalized, user-friendly error surfaced by the API layer. */
export class QaApiError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "QaApiError";
    this.code = code;
  }
}
