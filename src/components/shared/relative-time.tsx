"use client";

import * as React from "react";
import { formatDateTime, formatRelativeTime } from "@/lib/formatters/number";

interface RelativeTimeProps {
  iso: string;
  className?: string;
}

function subscribeToNothing() {
  return () => {};
}

/**
 * Renders an absolute timestamp on the server (and first client paint) then
 * upgrades to a relative label after hydration. This avoids hydration mismatches
 * that a Date.now()-based relative string would otherwise cause.
 */
export function RelativeTime({ iso, className }: RelativeTimeProps) {
  const isClient = React.useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );

  return (
    <time dateTime={iso} className={className} title={formatDateTime(iso)}>
      {isClient ? formatRelativeTime(iso) : formatDateTime(iso)}
    </time>
  );
}
