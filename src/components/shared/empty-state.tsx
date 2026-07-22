import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon = Inbox, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      role="status"
      className={cn(
        "glass-surface-b flex flex-col items-center gap-3 rounded-lg border-dashed px-6 py-12 text-center",
        className,
      )}
    >
      <div className="flex size-12 items-center justify-center rounded-full bg-gt-surface-2 text-gt-muted">
        <Icon className="size-5" aria-hidden />
      </div>
      <p className="text-sm font-semibold text-gt-fg">{title}</p>
      {description && <p className="max-w-sm text-sm text-gt-muted">{description}</p>}
      {action}
    </div>
  );
}
