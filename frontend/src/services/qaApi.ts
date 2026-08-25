/**
 * Centralized API service for the QA agent backend.
 * UI components must only talk to the backend through this module.
 *
 * Endpoints (override the base URL with VITE_QA_API_URL):
 *   POST /api/test/start
 *   POST /api/test/{runId}/input
 *   GET  /api/test/{runId}/status
 *   GET  /api/test/{runId}/results
 */
import type {
  RunResults,
  RunStatusResponse,
  StartTestRequest,
  StartTestResponse,
} from "@/types/qa";
import { request, USE_MOCK_API } from "./httpClient";
import { normalizeStages } from "./pipeline";
import { mockQaApi } from "./mockQaApi";

export interface QaApi {
  startTest(payload: StartTestRequest): Promise<StartTestResponse>;
  submitInput(runId: string, values: Record<string, string>): Promise<RunStatusResponse>;
  getStatus(runId: string): Promise<RunStatusResponse>;
  getResults(runId: string): Promise<RunResults>;
}

const httpQaApi: QaApi = {
  startTest: (payload) =>
    request<StartTestResponse>("/api/test/start", { method: "POST", body: payload }),

  submitInput: async (runId, values) => {
    const res = await request<RunStatusResponse>(`/api/test/${runId}/input`, {
      method: "POST",
      body: values,
    });
    return { ...res, stages: normalizeStages(res.stages) };
  },

  getStatus: async (runId) => {
    const res = await request<RunStatusResponse>(`/api/test/${runId}/status`);
    return { ...res, stages: normalizeStages(res.stages) };
  },

  getResults: (runId) => request<RunResults>(`/api/test/${runId}/results`),
};

export const qaApi: QaApi = USE_MOCK_API ? mockQaApi : httpQaApi;
export const isUsingMockApi = USE_MOCK_API;
