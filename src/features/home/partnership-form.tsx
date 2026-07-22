"use client";

import { useState, type FormEvent } from "react";
import { Check, Clipboard, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const CATEGORIES = [
  "COMMUNITY", "MARKETING", "TECHNOLOGY", "ENVIRONMENTAL",
  "MEDIA", "EXCHANGE", "RESEARCH", "OTHER",
] as const;
type ContactType = "X" | "TELEGRAM" | "EMAIL";

interface Receipt {
  requestNumber: string;
  duplicate: boolean;
  submittedAt: number;
  submittedContact: string;
}

const fieldClass = "space-y-1.5";
const labelClass = "text-xs font-medium uppercase tracking-[0.08em] text-gt-muted";
const textareaClass = "w-full rounded-md border border-gt-border bg-gt-surface/75 px-3 py-2 text-sm text-gt-fg placeholder:text-gt-muted-2 focus:border-gt-info focus:outline-none";

export function PartnershipForm() {
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [contactType, setContactType] = useState<ContactType>("X");
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    try {
      const response = await fetch("/api/partnerships", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          nameOrProject: values.nameOrProject,
          category: values.category,
          contactType,
          contact: values.contact,
          proposal: values.proposal,
          website: values.website,
          company: values.company,
          startedAt,
        }),
      });
      const result = await response.json() as {
        success?: boolean; duplicate?: boolean; requestNumber?: string; error?: string;
      };
      if (!response.ok || !result.success || !result.requestNumber) {
        throw new Error(result.error || "The request could not be submitted.");
      }
      setReceipt({
        requestNumber: result.requestNumber,
        duplicate: Boolean(result.duplicate),
        submittedAt: Date.now(),
        submittedContact: String(values.contact),
      });
      form.reset();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The request could not be submitted.");
    } finally {
      setPending(false);
    }
  }

  if (receipt) {
    return (
      <div className="rounded-xl border border-gt-info/25 bg-gt-surface/70 p-6 shadow-2xl shadow-black/15">
        <span className="flex size-10 items-center justify-center rounded-full bg-gt-info/10 text-gt-info">
          <Check className="size-5" aria-hidden />
        </span>
        <p className="mt-5 font-mono text-xs uppercase tracking-[0.18em] text-gt-info">Request received</p>
        <h3 className="mt-2 text-xl font-semibold text-gt-fg">Your request number</h3>
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-md border border-gt-border bg-[#0b1518] p-3">
          <code className="mr-auto text-base font-semibold text-gt-emerald-bright">{receipt.requestNumber}</code>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={async () => {
              await navigator.clipboard.writeText(receipt.requestNumber);
              setCopied(true);
            }}
          >
            <Clipboard className="size-4" aria-hidden /> {copied ? "Copied" : "Copy"}
          </Button>
        </div>
        <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-gt-muted">Contact</dt><dd className="break-all">{receipt.submittedContact}</dd></div>
          <div><dt className="text-gt-muted">Submitted</dt><dd>{new Date(receipt.submittedAt).toLocaleDateString()}</dd></div>
        </dl>
        {receipt.duplicate && (
          <p className="mt-4 text-sm text-gt-muted">This matches a recent request, so its existing receipt is shown.</p>
        )}
        <Button
          type="button"
          variant="ghost"
          className="mt-5"
          onClick={() => {
            setReceipt(null);
            setCopied(false);
            setStartedAt(Date.now());
          }}
        >
          Submit another request
        </Button>
      </div>
    );
  }

  const contactInput = {
    X: { label: "X contact", placeholder: "@username or x.com/username", type: "text", autoComplete: "off" },
    TELEGRAM: { label: "Telegram contact", placeholder: "@username or t.me/username", type: "text", autoComplete: "off" },
    EMAIL: { label: "Email contact", placeholder: "name@example.com", type: "email", autoComplete: "email" },
  }[contactType];

  return (
    <form
      onSubmit={submit}
      className="w-full max-w-[520px] rounded-lg border border-gt-border bg-gt-surface/45 p-5 shadow-xl shadow-black/10 sm:p-6"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={fieldClass}>
          <span className={labelClass}>Name or project</span>
          <Input name="nameOrProject" required minLength={2} maxLength={180} autoComplete="organization" />
        </label>
        <label className={fieldClass}>
          <span className={labelClass}>Partnership category</span>
          <select name="category" required defaultValue="" className="h-10 rounded-md border border-gt-border bg-gt-surface px-3 text-sm">
            <option value="" disabled>Select category</option>
            {CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category.charAt(0) + category.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
        </label>
        <fieldset className={fieldClass}>
          <legend className={labelClass}>Preferred contact</legend>
          <div className="grid grid-cols-3 gap-1 rounded-md border border-gt-border bg-black/10 p-1">
            {(["X", "TELEGRAM", "EMAIL"] as const).map((method) => (
              <button
                key={method}
                type="button"
                aria-pressed={contactType === method}
                onClick={() => setContactType(method)}
                className={`min-h-9 rounded px-2 text-xs font-medium transition-colors ${
                  contactType === method ? "bg-gt-emerald text-gt-black" : "text-gt-muted hover:text-gt-fg"
                }`}
              >
                {method === "TELEGRAM" ? "Telegram" : method === "EMAIL" ? "Email" : "X"}
              </button>
            ))}
          </div>
        </fieldset>
        <label className={fieldClass}>
          <span className={labelClass}>{contactInput.label}</span>
          <Input
            key={contactType}
            name="contact"
            type={contactInput.type}
            required
            maxLength={254}
            autoComplete={contactInput.autoComplete}
            placeholder={contactInput.placeholder}
          />
        </label>
        <label className={`${fieldClass} sm:col-span-2`}>
          <span className={labelClass}>How would you like to collaborate?</span>
          <textarea
            name="proposal"
            required
            maxLength={800}
            rows={4}
            placeholder="Briefly describe your proposal."
            className={textareaClass}
          />
        </label>
        <label className={`${fieldClass} sm:col-span-2`}>
          <span className={labelClass}>Website, optional</span>
          <Input name="website" maxLength={300} placeholder="https://example.org" inputMode="url" />
        </label>
      </div>
      <label className="sr-only" aria-hidden="true">
        Company
        <input name="company" tabIndex={-1} autoComplete="off" />
      </label>
      {error && <p className="mt-4 text-sm text-red-300" role="alert">{error}</p>}
      <Button type="submit" disabled={pending} className="mt-5 w-full">
        <Send className="size-4" aria-hidden /> {pending ? "Submitting…" : "Submit partnership request"}
      </Button>
      <p className="mt-3 text-xs leading-5 text-gt-muted-2">
        By submitting, you allow Green Tree to review your information and contact you about this request.
      </p>
    </form>
  );
}
