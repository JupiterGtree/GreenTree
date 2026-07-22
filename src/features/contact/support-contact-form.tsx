"use client";

import * as React from "react";
import { CheckCircle2, LoaderCircle, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const textareaClass = "min-h-32 w-full resize-y rounded-md border border-gt-border bg-gt-surface/75 px-3 py-2.5 text-sm text-gt-fg placeholder:text-gt-muted-2 transition-colors focus-visible:border-gt-emerald focus-visible:bg-gt-surface-2/90 focus-visible:outline-none";
const labelClass = "text-xs font-medium uppercase tracking-[0.08em] text-gt-muted";

export function SupportContactForm() {
  const [submitted, setSubmitted] = React.useState<{ requestNumber: string; duplicate: boolean } | null>(null);
  const [error, setError] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const startedAt = React.useRef(0);
  React.useEffect(() => { startedAt.current = Date.now(); }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setError("");
    setSubmitted(null);
    const values = new FormData(form);
    setPending(true);
    try {
      const response = await fetch("/api/support", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: values.get("name"), email: values.get("email"), subject: values.get("subject"),
          message: values.get("message"), company: values.get("company"), startedAt: startedAt.current,
        }),
      });
      const result = await response.json() as { success?: boolean; requestNumber?: string; duplicate?: boolean; error?: string };
      if (!response.ok || !result.success || !result.requestNumber) throw new Error(result.error ?? "Unable to submit your request.");
      setSubmitted({ requestNumber: result.requestNumber, duplicate: Boolean(result.duplicate) });
      form.reset();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to submit your request.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="glass-surface-b rounded-lg p-5 sm:p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="sr-only" aria-hidden="true">
          Company <input name="company" tabIndex={-1} autoComplete="off" />
        </label>
        <label className="space-y-1.5">
          <span className={labelClass}>Your name</span>
          <Input name="name" required minLength={2} maxLength={100} autoComplete="name" />
        </label>
        <label className="space-y-1.5">
          <span className={labelClass}>Reply email</span>
          <Input name="email" type="email" required maxLength={254} autoComplete="email" />
        </label>
        <label className="space-y-1.5 sm:col-span-2">
          <span className={labelClass}>Topic</span>
          <select name="subject" className="h-10 w-full rounded-md border border-gt-border bg-gt-surface/75 px-3 text-sm text-gt-fg focus-visible:border-gt-emerald focus-visible:outline-none">
            <option>Purchase, wallet, or transaction</option>
            <option>Website or account issue</option>
            <option>General support</option>
          </select>
        </label>
        <label className="space-y-1.5 sm:col-span-2">
          <span className={labelClass}>How can we help?</span>
          <textarea
            name="message"
            required
            minLength={10}
            maxLength={2_000}
            rows={5}
            className={textareaClass}
            placeholder="Include relevant transaction signatures or wallet addresses when they help us investigate. Never share a seed phrase or private key."
          />
        </label>
      </div>
      <Button type="submit" disabled={pending} className="mt-5 w-full sm:w-auto">
        {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}
        {pending ? "Submitting request…" : "Submit support request"}
      </Button>
      <p className="mt-3 text-xs leading-5 text-gt-muted-2">
        Your request is stored securely in the Green Tree support inbox. Never share a seed phrase, private key, or wallet recovery phrase.
      </p>
      {submitted && (
        <div role="status" aria-live="polite" className="mt-4 rounded-md border border-gt-emerald/35 bg-gt-emerald/10 p-3 text-sm text-gt-fg">
          <p className="inline-flex items-center gap-1.5 font-medium text-gt-emerald-bright"><CheckCircle2 className="size-4" aria-hidden /> {submitted.duplicate ? "Your matching request is already in our inbox." : "Your support request has been received."}</p>
          <p className="mt-2 text-gt-muted">Tracking code: <span className="font-mono font-semibold text-gt-fg">{submitted.requestNumber}</span>. Please save it for future follow-up.</p>
        </div>
      )}
      {error && <p role="alert" className="mt-3 text-sm text-red-300">{error}</p>}
    </form>
  );
}
