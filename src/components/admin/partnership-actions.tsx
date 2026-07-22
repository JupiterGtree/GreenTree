"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import type { PartnershipStatus } from "@/lib/partnerships/repository";

const STATUSES: PartnershipStatus[] = ["NEW", "REVIEWING", "CONTACTED", "ACCEPTED", "REJECTED", "ARCHIVED"];

interface Props {
  id: string;
  status: PartnershipStatus;
  assignedUserId: string | null;
  allowResubmission: boolean;
  unread: boolean;
  contactData: string;
  contactHref: string | null;
  admins: Array<{ id: string; email: string }>;
  csrfToken: string;
}

export function PartnershipActions(props: Props) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function mutate(payload: Record<string, unknown>) {
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/admin/api/partnerships/${props.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", "x-csrf-token": props.csrfToken },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error("The update could not be saved.");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The update could not be saved.");
    } finally {
      setPending(false);
    }
  }

  function addNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const note = String(new FormData(form).get("note") ?? "");
    void mutate({ action: "note", note }).then(() => form.reset());
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-2 text-sm">
          <span className="text-gt-muted">Status</span>
          <select
            defaultValue={props.status}
            disabled={pending}
            onChange={(event) => void mutate({ action: "status", status: event.target.value })}
            className="h-10 w-full rounded-md border border-gt-border bg-gt-surface px-3"
          >
            {STATUSES.map((status) => <option key={status}>{status}</option>)}
          </select>
        </label>
        <label className="space-y-2 text-sm">
          <span className="text-gt-muted">Assigned administrator</span>
          <select
            defaultValue={props.assignedUserId ?? ""}
            disabled={pending}
            onChange={(event) => void mutate({ action: "assign", assignedUserId: event.target.value || null })}
            className="h-10 w-full rounded-md border border-gt-border bg-gt-surface px-3"
          >
            <option value="">Unassigned</option>
            {props.admins.map((admin) => <option key={admin.id} value={admin.id}>{admin.email}</option>)}
          </select>
        </label>
      </div>
      <div className="flex flex-wrap gap-3">
        {props.unread && (
          <Button type="button" variant="outline" disabled={pending} onClick={() => void mutate({ action: "read" })}>
            Mark read
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          onClick={() => void navigator.clipboard.writeText(props.contactData)}
        >
          Copy contact data
        </Button>
        {props.contactHref && (
          <Button type="button" variant="outline" asChild>
            <a href={props.contactHref} target={props.contactHref.startsWith("mailto:") ? undefined : "_blank"} rel="noreferrer">
              Open preferred contact
            </a>
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => void mutate({ action: "status", status: "CONTACTED" })}
        >
          Mark contacted
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => void mutate({ action: "resubmission", allow: !props.allowResubmission })}
        >
          {props.allowResubmission ? "Disallow resubmission" : "Allow resubmission"}
        </Button>
        {props.status !== "ARCHIVED" && (
          <Button type="button" variant="destructive" disabled={pending} onClick={() => void mutate({ action: "archive" })}>
            Archive
          </Button>
        )}
      </div>
      <form onSubmit={addNote} className="space-y-3">
        <label className="block text-sm text-gt-muted" htmlFor="partnership-note">Add internal note</label>
        <textarea
          id="partnership-note"
          name="note"
          required
          maxLength={5000}
          rows={4}
          className="w-full rounded-md border border-gt-border bg-gt-surface px-3 py-2 text-sm focus:border-gt-info focus:outline-none"
        />
        <Button type="submit" disabled={pending}>Save note</Button>
      </form>
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
    </div>
  );
}
