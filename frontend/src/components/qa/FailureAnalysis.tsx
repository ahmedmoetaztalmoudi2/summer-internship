import type { FailureDetails } from "@/types/qa";

export function FailureAnalysis({ failure }: { failure: FailureDetails }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div className="space-y-1.5">
          <span className="text-[10px] font-semibold tracking-wider text-danger/70 uppercase">
            Failure Category
          </span>
          <p className="text-sm text-danger">{failure.category}</p>
        </div>
        {failure.failedStep ? (
          <div className="space-y-1.5">
            <span className="text-[10px] font-semibold tracking-wider text-danger/70 uppercase">
              Failed Step
            </span>
            <code className="block rounded bg-danger/10 px-1 py-0.5 font-mono text-[11px] text-danger">
              {failure.failedStep}
            </code>
          </div>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <span className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
          Error
        </span>
        <p className="font-mono text-[12px] leading-relaxed text-foreground/80">{failure.message}</p>
      </div>

      {failure.selector ? (
        <div className="space-y-1.5">
          <span className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
            Selector
          </span>
          <code className="block font-mono text-[12px] text-foreground/80">{failure.selector}</code>
        </div>
      ) : null}

      {failure.analysis ? (
        <div className="space-y-2">
          <span className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
            Agent Analysis
          </span>
          <p className="max-w-[56ch] text-pretty text-sm leading-relaxed text-foreground/80">
            {failure.analysis}
          </p>
        </div>
      ) : null}
    </div>
  );
}
