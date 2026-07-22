import { AlertTriangle } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ErrorStateProps {
  title?: string;
  description?: string;
  className?: string;
  children?: ReactNode;
}

export function ErrorState({
  title = "Unable to load this data",
  description = "Please try again in a moment. If the issue continues, the data source may be temporarily unavailable.",
  className,
  children,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center gap-3 rounded-lg border border-gt-danger/30 bg-gt-danger/5 px-6 py-10 text-center",
        className,
      )}
    >
      <div className="flex size-12 items-center justify-center rounded-full bg-gt-danger/10 text-gt-danger">
        <AlertTriangle className="size-5" aria-hidden />
      </div>
      <p className="text-sm font-semibold text-gt-fg">{title}</p>
      <p className="max-w-sm text-sm text-gt-muted">{description}</p>
      {children}
    </div>
  );
}
