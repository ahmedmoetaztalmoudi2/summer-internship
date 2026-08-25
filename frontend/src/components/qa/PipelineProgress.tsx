import type { PipelineStage, RunStatus } from "@/types/qa";
import { PipelineStep } from "./PipelineStep";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<RunStatus, string> = {
  pending: "Preparing run",
  awaiting_input: "Awaiting additional information",
  running: "Agent Pipeline Active",
  completed: "Pipeline complete",
  failed: "Pipeline failed",
};

interface Props {
  ticket: string;
  websiteUrl: string;
  status: RunStatus;
  stages: PipelineStage[];
}

export function PipelineProgress({ ticket, websiteUrl, status, stages }: Props) {
  return (
    <section className="border-y border-border bg-secondary/30 px-6 py-16">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <div className="mb-1 flex flex-wrap items-center gap-3">
              <span className="rounded bg-foreground/5 px-2 py-0.5 font-mono text-xs text-muted-foreground">
                {ticket || "—"}
              </span>
              <span className="text-sm text-muted-foreground">{websiteUrl}</span>
            </div>
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "size-2 rounded-full",
                  status === "running" && "animate-pulse bg-brand",
                  status === "completed" && "bg-brand",
                  status === "failed" && "bg-danger",
                  (status === "pending" || status === "awaiting_input") && "bg-warning",
                )}
              />
              <span className="text-sm font-medium text-foreground">{STATUS_LABEL[status]}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4 lg:grid-cols-8">
          {stages.map((stage) => (
            <PipelineStep key={stage.id} stage={stage} />
          ))}
        </div>
      </div>
    </section>
  );
}
