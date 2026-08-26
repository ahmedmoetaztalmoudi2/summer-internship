import { cn } from "@/lib/utils";

interface Props {
  compact?: boolean;
  className?: string;
}

export function CapgeminiEngineeringLogo({ compact, className }: Props) {
  return (
    <div className={cn("flex items-center gap-3", className)} aria-label="Capgemini Engineering">
      <img
        src="/logo-vector-Capgemini-Engineering1.png"
        alt="Capgemini Engineering logo"
        className={cn("shrink-0 object-contain", compact ? "h-20 w-auto" : "h-28 w-auto sm:h-36")}
      />
    </div>
  );
}
