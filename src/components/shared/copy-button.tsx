"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

interface CopyButtonProps {
  value: string;
  label?: string;
  className?: string;
  iconOnly?: boolean;
}

export function CopyButton({ value, label = "Copy", className, iconOnly = false }: CopyButtonProps) {
  const [copied, setCopied] = React.useState(false);
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCopy = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Clipboard may be unavailable (e.g. insecure context); fail silently.
    }
    setCopied(true);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setCopied(false), 1800);
  }, [value]);

  React.useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={copied ? "Copied to clipboard" : `${label}: ${value}`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md p-1.5 text-gt-muted transition-colors hover:bg-gt-surface-2 hover:text-gt-emerald-bright focus-visible:outline-2 focus-visible:outline-gt-emerald-bright",
        className,
      )}
    >
      {copied ? (
        <Check className="size-3.5 text-gt-emerald-bright" aria-hidden />
      ) : (
        <Copy className="size-3.5" aria-hidden />
      )}
      {!iconOnly && <span className="text-xs">{copied ? "Copied" : label}</span>}
    </button>
  );
}
