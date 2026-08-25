import type { PipelineStage } from "@/types/qa";
import { cn } from "@/lib/utils";

const MARK: Record<PipelineStage["status"], string> = {
  completed: "✓",
  failed: "✗",
  skipped: "–",
  running: "",
  waiting: "○",
};

export function PipelineStep({ stage }: { stage: PipelineStage }) {
  const { status } = stage;
  return (
    <div className={cn("space-y-3", (status === "waiting" || status === "skipped") && "opacity-40")}>
      <div
        className={cn(
          "flex items-center gap-2",
          status === "completed" && "text-brand",
          status === "running" && "text-brand",
          status === "failed" && "text-danger",
          (status === "waiting" || status === "skipped") && "text-muted-foreground",
        )}
      >
        <div
          className={cn(
            "flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ring-1",
            status === "completed" && "ring-brand/30",
            status === "running" && "ring-brand",
            status === "failed" && "ring-danger/40",
            (status === "waiting" || status === "skipped") && "ring-border",
          )}
        >
          {status === "running" ? (
            <span className="size-1.5 animate-ping rounded-full bg-brand" />
          ) : (
            MARK[status]
          )}
        </div>
        <span className="text-[11px] font-medium tracking-wider uppercase">{stage.shortLabel}</span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-secondary">
        {status === "completed" && <div className="h-full w-full rounded-full bg-brand" />}
        {status === "failed" && <div className="h-full w-full rounded-full bg-danger" />}
        {status === "running" && <div className="animate-shimmer h-full w-1/2 bg-brand" />}
      </div>
      {stage.detail ? (
        <p className="text-[11px] text-muted-foreground">{stage.detail}</p>
      ) : null}
    </div>
  );
}
