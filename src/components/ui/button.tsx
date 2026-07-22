import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:size-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gt-emerald-bright",
  {
    variants: {
      variant: {
        primary:
          "bg-gt-emerald text-gt-black hover:bg-gt-emerald-bright shadow-[0_1px_0_0_rgba(0,0,0,0.15)]",
        secondary:
          "border border-white/15 bg-gt-charcoal/60 text-gt-fg hover:border-gt-emerald/60 hover:bg-gt-surface-2",
        outline:
          "border border-gt-border text-gt-fg hover:bg-gt-surface-2 hover:border-gt-moss",
        ghost: "text-gt-fg hover:bg-gt-surface-2",
        gold: "bg-gt-gold text-gt-black hover:bg-gt-gold-bright",
        link: "text-gt-emerald-bright underline-offset-4 hover:underline",
        destructive: "bg-gt-danger/90 text-gt-black hover:bg-gt-danger",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        default: "h-10 px-4",
        lg: "h-12 px-6 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp className={cn(buttonVariants({ variant, size, className }))} {...props} />
  );
}

export { Button, buttonVariants };
