import type { TestSummaryData } from "@/types/qa";

function Metric({ label, value, tone }: { label: string; value: string; tone?: "danger" }) {
  return (
    <div>
      <span className="mb-1 block text-[10px] font-medium tracking-widest text-muted-foreground uppercase">
        {label}
      </span>
      <span
        className={
          tone === "danger"
            ? "text-xl font-medium text-danger"
            : "text-xl font-medium text-foreground"
        }
      >
        {value}
      </span>
    </div>
  );
}

export function TestSummary({ summary }: { summary: TestSummaryData }) {
  return (
    <div className="mb-8 flex items-end justify-between border-b border-border pb-6">
      <div className="grid grid-cols-2 gap-8 sm:grid-cols-5 sm:gap-12">
        <Metric label="Total" value={String(summary.total)} />
        <Metric label="Passed" value={String(summary.passed)} />
        <Metric label="Failed" value={String(summary.failed)} tone="danger" />
        <Metric label="Success Rate" value={`${Math.round(summary.passRate)}%`} />
        <Metric label="Runtime" value={`${(summary.executionTimeMs / 1000).toFixed(1)}s`} />
      </div>
    </div>
  );
}
