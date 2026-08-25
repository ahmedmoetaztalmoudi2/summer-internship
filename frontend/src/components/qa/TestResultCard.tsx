import { useState } from "react";
import type { TestCaseResult } from "@/types/qa";
import { FailureAnalysis } from "./FailureAnalysis";
import { RepairStatus } from "./RepairStatus";
import { cn } from "@/lib/utils";

export function TestResultCard({ test }: { test: TestCaseResult }) {
  const failed = test.status === "failed";
  const [open, setOpen] = useState(failed);

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg ring-1",
        failed ? "bg-surface ring-danger/20" : "bg-secondary/60 ring-foreground/5",
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-4 p-4 text-left"
      >
        <div className="flex items-center gap-3">
          <span className={failed ? "text-danger" : "text-brand"}>{failed ? "✗" : "✓"}</span>
          <span className="text-sm font-medium">{test.name}</span>
        </div>
        <div className="flex items-center gap-4">
          {test.durationMs ? (
            <span className="font-mono text-[10px] text-muted-foreground">
              {(test.durationMs / 1000).toFixed(1)}s
            </span>
          ) : null}
          <span
            className={cn(
              "font-mono text-[10px] font-medium uppercase",
              failed ? "text-danger" : "text-muted-foreground",
            )}
          >
            {test.status}
          </span>
        </div>
      </button>

      {open && (test.failure || test.repair) ? (
        <div className="space-y-6 border-t border-border p-6">
          {test.failure ? <FailureAnalysis failure={test.failure} /> : null}
          {test.repair ? <RepairStatus repair={test.repair} /> : null}
        </div>
      ) : null}
    </div>
  );
}
