import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium leading-none w-fit",
  {
    variants: {
      variant: {
        neutral: "border-gt-border bg-gt-surface-2 text-gt-muted",
        emerald: "border-gt-emerald/30 bg-gt-emerald/10 text-gt-emerald-bright",
        gold: "border-gt-gold/30 bg-gt-gold/10 text-gt-gold-bright",
        warning: "border-gt-warning/30 bg-gt-warning/10 text-gt-warning",
        danger: "border-gt-danger/30 bg-gt-danger/10 text-gt-danger",
        info: "border-gt-info/30 bg-gt-info/10 text-gt-info",
        outline: "border-gt-border text-gt-fg",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant, className }))} {...props} />;
}

export { Badge, badgeVariants };
