"use client";

import * as React from "react";
import { animate } from "framer-motion";
import { formatNumber, formatUsd } from "@/lib/formatters/number";

interface AnimatedNumberProps {
  value: number;
  format: (value: number) => string;
  className?: string;
  durationMs?: number;
}

function subscribeReducedMotion(onStoreChange: () => void) {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", onStoreChange);
  return () => query.removeEventListener("change", onStoreChange);
}

function getReducedMotionSnapshot() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function getReducedMotionServerSnapshot() {
  return false;
}

export function usePrefersReducedMotion(): boolean {
  return React.useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    getReducedMotionServerSnapshot,
  );
}

export function AnimatedNumber({ value, format, className, durationMs = 700 }: AnimatedNumberProps) {
  const reducedMotion = usePrefersReducedMotion();
  const [display, setDisplay] = React.useState(value);
  const prevValue = React.useRef(value);

  React.useEffect(() => {
    if (reducedMotion) {
      prevValue.current = value;
      return;
    }
    const from = prevValue.current;
    const controls = animate(from, value, {
      duration: durationMs / 1000,
      ease: "easeOut",
      onUpdate: (latest) => setDisplay(latest),
      onComplete: () => {
        prevValue.current = value;
      },
    });
    return () => controls.stop();
  }, [value, durationMs, reducedMotion]);

  const shown = reducedMotion ? value : display;
  return <span className={className}>{format(shown)}</span>;
}

/**
 * Preformatted variants exist because a format() function cannot be passed
 * as a prop from a Server Component into this Client Component boundary.
 */
export function AnimatedUsd({ value, decimals, className }: { value: number; decimals?: number; className?: string }) {
  return <AnimatedNumber value={value} format={(v) => formatUsd(v, { decimals })} className={className} />;
}

export function AnimatedCompactUsd({ value, className }: { value: number; className?: string }) {
  return <AnimatedNumber value={value} format={(v) => formatUsd(v, { compact: true })} className={className} />;
}

export function AnimatedSolPrice({ value, className }: { value: number; className?: string }) {
  return <AnimatedNumber value={value} format={(v) => `${v.toFixed(8)} SOL`} className={className} />;
}

export function AnimatedCount({ value, compact, className }: { value: number; compact?: boolean; className?: string }) {
  return <AnimatedNumber value={value} format={(v) => formatNumber(v, { compact })} className={className} />;
}
