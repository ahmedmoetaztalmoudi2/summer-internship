import type { RepairDetails } from "@/types/qa";
import { cn } from "@/lib/utils";

const LABEL: Record<RepairDetails["status"], string> = {
  proposed: "Repair Proposal",
  applied: "Repair Applied",
  failed: "Repair Failed",
  not_attempted: "No Repair Attempted",
};

export function RepairStatus({ repair }: { repair: RepairDetails }) {
  const failed = repair.status === "failed";
  return (
    <div className="flex flex-wrap items-center gap-3 pt-4">
      <div
        className={cn(
          "flex items-center gap-2 rounded px-3 py-2 ring-1",
          failed ? "bg-danger/10 ring-danger/20" : "bg-brand/10 ring-brand/20",
        )}
      >
        <div className={cn("size-1.5 rounded-full", failed ? "bg-danger" : "bg-brand")} />
        <span className={cn("text-xs font-medium", failed ? "text-danger" : "text-brand")}>
          {LABEL[repair.status]}
          {repair.proposal ? `: ${repair.proposal}` : ""}
        </span>
      </div>
    </div>
  );
}
