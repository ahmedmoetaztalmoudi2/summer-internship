import { useCallback, useEffect, useRef, useState } from "react";
import { qaApi } from "@/services/qaApi";
import { createInitialStages } from "@/services/pipeline";
import {
  QaApiError,
  type PipelineStage,
  type RequiredInputField,
  type RunResults,
  type RunStatus,
} from "@/types/qa";

interface TestRunState {
  ticket: string;
  websiteUrl: string;
  status: RunStatus;
  stages: PipelineStage[];
  requiresInput: boolean;
  inputMessage?: string | undefined;
  fields: RequiredInputField[];
  results: RunResults | null;
  error: string | null;
  submitting: boolean;
}

const POLL_INTERVAL_MS = 1500;

/**
 * Owns the execution state of a single run. All updates come from API
 * responses, so swapping polling for websockets later touches only this hook.
 */
export function useTestRun(runId: string) {
  const [state, setState] = useState<TestRunState>({
    ticket: "",
    websiteUrl: "",
    status: "pending",
    stages: createInitialStages(),
    requiresInput: false,
    fields: [],
    results: null,
    error: null,
    submitting: false,
  });

  const stoppedRef = useRef(false);

  const applyStatus = useCallback(
    (res: Awaited<ReturnType<typeof qaApi.getStatus>>) => {
      setState((prev) => ({
        ...prev,
        ticket: res.ticket || prev.ticket,
        websiteUrl: res.websiteUrl || prev.websiteUrl,
        status: res.status,
        stages: res.stages?.length ? res.stages : prev.stages,
        requiresInput: Boolean(res.requiresInput),
        inputMessage: res.message,
        fields: res.fields ?? [],
        error: res.error ?? null,
      }));
    },
    [],
  );

  const loadResults = useCallback(async () => {
    try {
      const results = await qaApi.getResults(runId);
      setState((prev) => ({ ...prev, results }));
    } catch (err) {
      setState((prev) => ({ ...prev, error: messageOf(err) }));
    }
  }, [runId]);

  useEffect(() => {
    stoppedRef.current = false;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      try {
        const res = await qaApi.getStatus(runId);
        if (stoppedRef.current) return;
        applyStatus(res);
        if (res.status === "completed") {
          await loadResults();
          return;
        }
        if (res.status === "failed") return;
      } catch (err) {
        if (stoppedRef.current) return;
        setState((prev) => ({ ...prev, error: messageOf(err) }));
        return;
      }
      timer = setTimeout(tick, POLL_INTERVAL_MS);
    };

    void tick();
    return () => {
      stoppedRef.current = true;
      clearTimeout(timer);
    };
  }, [runId, applyStatus, loadResults]);

  const submitInput = useCallback(
    async (values: Record<string, string>) => {
      setState((prev) => ({ ...prev, submitting: true, error: null }));
      try {
        const res = await qaApi.submitInput(runId, values);
        applyStatus(res);
      } catch (err) {
        setState((prev) => ({ ...prev, error: messageOf(err) }));
      } finally {
        setState((prev) => ({ ...prev, submitting: false }));
      }
    },
    [runId, applyStatus],
  );

  return { ...state, submitInput };
}

export function messageOf(err: unknown): string {
  if (err instanceof QaApiError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return "Something went wrong. Please try again.";
}
