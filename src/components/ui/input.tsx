import * as React from "react";
import { cn } from "@/lib/utils";

function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "flex h-10 w-full rounded-md border border-gt-border bg-gt-surface/75 px-3 text-sm text-gt-fg backdrop-blur-sm placeholder:text-gt-muted-2 transition-colors focus-visible:border-gt-emerald focus-visible:bg-gt-surface-2/90 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
