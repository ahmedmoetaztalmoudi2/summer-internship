import type { PipelineStage, PipelineStageId } from "@/types/qa";

export const PIPELINE_STAGES: { id: PipelineStageId; label: string; shortLabel: string }[] = [
  { id: "jira_analysis", label: "Jira Analysis", shortLabel: "Analysis" },
  { id: "acceptance_criteria", label: "Acceptance Criteria Extraction", shortLabel: "Criteria" },
  { id: "gherkin_generation", label: "Gherkin Generation", shortLabel: "Gherkin" },
  { id: "selector_verification", label: "Selector Verification", shortLabel: "Selectors" },
  { id: "playwright_generation", label: "Playwright Generation", shortLabel: "Generation" },
  { id: "test_execution", label: "Test Execution", shortLabel: "Execution" },
  { id: "failure_analysis", label: "Failure Analysis", shortLabel: "Failures" },
  { id: "repair", label: "Repair", shortLabel: "Repair" },
];

export function createInitialStages(): PipelineStage[] {
  return PIPELINE_STAGES.map((stage) => ({ ...stage, status: "waiting" as const }));
}

/**
 * Backends may return partial stage data (e.g. only `id` + `status`).
 * This normalizes whatever arrives into the full ordered stage list.
 */
export function normalizeStages(input: unknown): PipelineStage[] {
  const incoming = Array.isArray(input) ? input : [];
  const byId = new Map<string, Partial<PipelineStage>>();
  for (const raw of incoming) {
    if (raw && typeof raw === "object" && "id" in raw) {
      byId.set(String((raw as PipelineStage).id), raw as Partial<PipelineStage>);
    }
  }
  return PIPELINE_STAGES.map((stage) => {
    const match = byId.get(stage.id);
    return {
      ...stage,
      status: match?.status ?? "waiting",
      detail: match?.detail,
    };
  });
}
