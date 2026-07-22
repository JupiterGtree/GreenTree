"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import type { SupportStatus } from "@/lib/support/repository";

const STATUSES: SupportStatus[] = ["NEW", "REVIEWING", "RESPONDED", "RESOLVED", "CLOSED"];
export function SupportActions({ id, status, csrfToken }: { id: string; status: SupportStatus; csrfToken: string }) {
  const router = useRouter(); const [pending, setPending] = useState(false); const [error, setError] = useState("");
  async function mutate(payload: Record<string, unknown>) {
    setPending(true); setError("");
    try { const response = await fetch(`/admin/api/support/${id}`, { method: "PATCH", headers: { "content-type": "application/json", "x-csrf-token": csrfToken }, body: JSON.stringify(payload) }); if (!response.ok) throw new Error("The update could not be saved."); router.refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "The update could not be saved."); } finally { setPending(false); }
  }
  function note(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = event.currentTarget; void mutate({ action: "note", note: new FormData(form).get("note") }).then(() => form.reset()); }
  function reply(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = event.currentTarget; void mutate({ action: "reply", reply: new FormData(form).get("reply") }).then(() => form.reset()); }
  return <div className="space-y-5"><label className="block space-y-2 text-sm"><span className="text-gt-muted">Status</span><select defaultValue={status} disabled={pending} onChange={(event) => void mutate({ action: "status", status: event.target.value })} className="h-10 w-full rounded-md border border-gt-border bg-gt-surface px-3">{STATUSES.map((item) => <option key={item}>{item}</option>)}</select></label><form onSubmit={reply} className="space-y-3"><label className="block text-sm text-gt-muted" htmlFor="support-reply">Public reply</label><textarea id="support-reply" name="reply" required maxLength={3000} rows={4} className="w-full rounded-md border border-gt-border bg-gt-surface px-3 py-2 text-sm"/><Button type="submit" disabled={pending}>Send public reply</Button></form><form onSubmit={note} className="space-y-3"><label className="block text-sm text-gt-muted" htmlFor="support-note">Internal note</label><textarea id="support-note" name="note" required maxLength={5000} rows={4} className="w-full rounded-md border border-gt-border bg-gt-surface px-3 py-2 text-sm"/><Button type="submit" disabled={pending}>Save note</Button></form>{error && <p role="alert" className="text-sm text-red-300">{error}</p>}</div>;
}
