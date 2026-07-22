"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export function FoundationActivityLink() {
  const [admin, setAdmin] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/admin/api/session", {
      method: "GET",
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    }).then((response) => {
      if (response.ok) setAdmin(true);
    }).catch(() => {
      // Public activity remains the safe fallback.
    });
    return () => controller.abort();
  }, []);

  return (
    <Link
      href={admin ? "/admin/transactions" : "/#foundation-activity"}
      className="text-[11px] font-medium text-gt-emerald-bright hover:text-gt-offwhite"
    >
      View all
    </Link>
  );
}
