"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function AuditExport({ csrfToken, filters }: { csrfToken: string; filters: Record<string, unknown> }) {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  async function download() {
    setPending(true);
    setError("");
    try {
      const response = await fetch("/admin/api/audit", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ action: "export", filters }),
      });
      if (!response.ok) {
        const payload = await response.json() as { error?: string };
        throw new Error(payload.error || "Export failed.");
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `admin-audit-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Export failed.");
    } finally {
      setPending(false);
    }
  }
  return (
    <div>
      <Button type="button" variant="outline" disabled={pending} onClick={() => void download()}>
        {pending ? "Exporting…" : "Export CSV"}
      </Button>
      {error && <p role="alert" className="mt-2 text-xs text-red-300">{error}</p>}
    </div>
  );
}
