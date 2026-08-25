/**
 * ISOLATED MOCK LAYER — replace by setting VITE_QA_API_URL to the real backend.
 * Nothing here is imported by UI components; only `qaApi` selects between
 * this module and the real HTTP client.
 *
 * The shapes returned here mirror the real backend contract exactly.
 */
import type {
  RunResults,
  RunStatusResponse,
  StartTestRequest,
  StartTestResponse,
} from "@/types/qa";
import { QaApiError } from "@/types/qa";
import { createInitialStages, PIPELINE_STAGES } from "./pipeline";

interface MockRun {
  runId: string;
  ticket: string;
  websiteUrl: string;
  startedAt: number;
  inputProvided: boolean;
}

const runs = new Map<string, MockRun>();

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const mockQaApi = {
  async startTest(payload: StartTestRequest): Promise<StartTestResponse> {
    await delay(700);
    if (!/^[A-Za-z][A-Za-z0-9]*-\d+$/.test(payload.ticket.trim())) {
      throw new QaApiError(
        "invalid_ticket",
        "That Jira ticket could not be found. Please check the ticket key and try again.",
      );
    }
    const runId = Math.random().toString(36).slice(2, 10);
    runs.set(runId, {
      runId,
      ticket: payload.ticket.trim(),
      websiteUrl: payload.websiteUrl.trim(),
      startedAt: Date.now(),
      inputProvided: false,
    });
    return {
      runId,
      status: "awaiting_input",
      requiresInput: true,
      message: "This test requires authentication to access the requested functionality.",
      fields: [
        { name: "email", label: "Email", type: "email", required: true },
        { name: "password", label: "Password", type: "password", required: true },
      ],
    };
  },

  async submitInput(runId: string, _values: Record<string, string>): Promise<RunStatusResponse> {
    await delay(500);
    const run = runs.get(runId);
    if (!run) throw new QaApiError("unknown", "This test run no longer exists.");
    run.inputProvided = true;
    run.startedAt = Date.now();
    return this.getStatus(runId);
  },

  async getStatus(runId: string): Promise<RunStatusResponse> {
    const run = runs.get(runId);
    if (!run) throw new QaApiError("unknown", "This test run no longer exists.");

    if (!run.inputProvided) {
      return {
        runId,
        ticket: run.ticket,
        websiteUrl: run.websiteUrl,
        status: "awaiting_input",
        stages: createInitialStages(),
        requiresInput: true,
        message: "This test requires authentication to access the requested functionality.",
        fields: [
          { name: "email", label: "Email", type: "email", required: true },
          { name: "password", label: "Password", type: "password", required: true },
        ],
      };
    }

    const elapsed = Date.now() - run.startedAt;
    const perStage = 2200;
    const done = Math.floor(elapsed / perStage);

    const stages = PIPELINE_STAGES.map((stage, index) => ({
      ...stage,
      status:
        index < done
          ? ("completed" as const)
          : index === done
            ? ("running" as const)
            : ("waiting" as const),
    }));

    const finished = done >= PIPELINE_STAGES.length;
    return {
      runId,
      ticket: run.ticket,
      websiteUrl: run.websiteUrl,
      status: finished ? "completed" : "running",
      stages: finished
        ? PIPELINE_STAGES.map((s) => ({ ...s, status: "completed" as const }))
        : stages,
    };
  },

  async getResults(runId: string): Promise<RunResults> {
    const run = runs.get(runId);
    if (!run) throw new QaApiError("unknown", "This test run no longer exists.");
    return {
      runId,
      ticket: run.ticket,
      websiteUrl: run.websiteUrl,
      summary: {
        total: 4,
        passed: 3,
        failed: 1,
        passRate: 75,
        executionTimeMs: 32400,
      },
      tests: [
        { id: "t1", name: "Affichage des menus déroulants", status: "passed", durationMs: 2100 },
        { id: "t2", name: "Aucun résultat", status: "passed", durationMs: 1800 },
        { id: "t3", name: "Chargement de plus d'événements", status: "passed", durationMs: 4800 },
        {
          id: "t4",
          name: "Recherche d'événements par salle et par date",
          status: "failed",
          durationMs: 10000,
          failure: {
            category: "timeout",
            message: "Timeout 10000ms waiting for selector '.event-card__location' to be visible",
            failedStep: "await page.click('.event-card-item')",
            selector: ".event-card__location",
            analysis:
              "The expected element was rendered in the DOM but hidden behind a sticky navigation overlay, so the interaction was intercepted before the timeout elapsed.",
          },
          repair: {
            status: "proposed",
            proposal: "Add a visibility guard and scroll into view before interacting with the element.",
          },
        },
      ],
      gherkin: `Feature: Event search

  Scenario: Search events by room and date
    Given I am on the events category page
    When I select the room "Théâtre municipal"
    And I select the date "Next Saturday"
    Then I should see the matching event results

  Scenario: No results
    Given I am on the events category page
    When I search for an event that does not exist
    Then I should see an empty state message`,
      playwrightCode: `import { test, expect } from '@playwright/test';

test('Search events by room', async ({ page }) => {
  // Requirement: User should be able to filter by room
  await page.goto('${run.websiteUrl}');

  await page.locator('[data-testid="room-filter"]').click();
  await page.selectOption('select#venue', { label: 'Théâtre municipal' });

  await expect(page.locator('.results-count')).toBeVisible();
});`,
    };
  },
};
