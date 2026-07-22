"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const REFRESH_INTERVAL_MS = 5 * 60 * 1_000;

export function AdminSessionControls({
  initialCsrfToken,
  compact = false,
}: {
  initialCsrfToken: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const csrfToken = useRef(initialCsrfToken);
  const lastActivityAt = useRef(0);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    lastActivityAt.current = Date.now();
    const recordActivity = () => {
      lastActivityAt.current = Date.now();
    };
    window.addEventListener("pointerdown", recordActivity, { passive: true });
    window.addEventListener("keydown", recordActivity);

    const interval = window.setInterval(async () => {
      if (Date.now() - lastActivityAt.current > REFRESH_INTERVAL_MS) return;
      try {
        const response = await fetch("/admin/api/session", {
          method: "POST",
          headers: { "x-csrf-token": csrfToken.current },
        });
        if (response.status === 401) {
          router.replace("/admin/login");
          router.refresh();
          return;
        }
        if (response.ok) {
          const body = (await response.json()) as { csrfToken?: string };
          if (body.csrfToken) csrfToken.current = body.csrfToken;
        }
      } catch {
        // A transient refresh failure does not destroy a still-valid local session.
      }
    }, REFRESH_INTERVAL_MS);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("pointerdown", recordActivity);
      window.removeEventListener("keydown", recordActivity);
    };
  }, [router]);

  async function logout() {
    setLoggingOut(true);
    try {
      const response = await fetch("/admin/api/logout", {
        method: "POST",
        headers: { "x-csrf-token": csrfToken.current },
      });
      if (!response.ok) {
        setLoggingOut(false);
        return;
      }
      router.replace("/admin/login");
      router.refresh();
    } catch {
      setLoggingOut(false);
    }
  }

  return (
    <button
      type="button"
      onClick={logout}
      disabled={loggingOut}
      className={compact
        ? "rounded-md px-2 py-1.5 text-xs font-medium text-gt-muted transition-colors hover:bg-gt-surface-2 hover:text-gt-fg focus-visible:outline-2 focus-visible:outline-gt-emerald-bright disabled:opacity-50"
        : "rounded-md border border-gt-border px-3 py-2 text-sm font-medium text-gt-fg transition-colors hover:bg-gt-surface-2 focus-visible:outline-2 focus-visible:outline-gt-emerald-bright disabled:opacity-50"}
    >
      {loggingOut ? "Signing out…" : "Sign out"}
    </button>
  );
}
