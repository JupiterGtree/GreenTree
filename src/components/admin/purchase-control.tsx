"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { RuntimeSettingView } from "@/lib/admin/runtime-settings";

interface AddressView { key: string; label: string; value: string | null }

export function PurchaseControl({
  settings,
  addresses,
  csrfToken,
  canChangeNonSensitive,
  canChangeSensitive,
}: {
  settings: RuntimeSettingView[];
  addresses: AddressView[];
  csrfToken: string;
  canChangeNonSensitive: boolean;
  canChangeSensitive: boolean;
}) {
  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-lg font-semibold">Critical addresses</h2>
        <p className="mt-1 text-sm text-gt-muted">Read-only public addresses. Signer material is never loaded or displayed.</p>
        <div className="mt-4 grid gap-3">
          {addresses.map((address) => (
            <div key={address.key} className="rounded-lg border border-gt-border bg-gt-charcoal/40 p-4">
              <div className="text-sm font-medium">{address.label}</div>
              <div className="mt-1 break-all font-mono text-xs text-gt-muted">{address.value ?? "Unavailable"}</div>
            </div>
          ))}
        </div>
      </section>
      <section>
        <h2 className="text-lg font-semibold">Approved runtime settings</h2>
        <p className="mt-1 text-sm text-gt-muted">Resolution order is environment, database, then built-in default.</p>
        <div className="mt-4 space-y-4">
          {settings.map((setting) => (
            <SettingEditor
              key={setting.key}
              setting={setting}
              csrfToken={csrfToken}
              allowed={setting.sensitive ? canChangeSensitive : canChangeNonSensitive}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function SettingEditor({
  setting,
  csrfToken,
  allowed,
}: {
  setting: RuntimeSettingView;
  csrfToken: string;
  allowed: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(setting.value === null ? "" : String(setting.value));
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/admin/api/purchase-control", {
        method: "PUT",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({
          key: setting.key,
          value: parseValue(value, setting.value),
          reason,
          confirmation: setting.sensitive ? confirmation : undefined,
        }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) {
        setMessage(body.error || "Update failed.");
        return;
      }
      setReason("");
      setConfirmation("");
      setMessage(setting.environmentOverride
        ? "Stored. The environment override remains effective."
        : "Setting updated.");
      router.refresh();
    } catch {
      setMessage("Update failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="rounded-lg border border-gt-border bg-gt-charcoal/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-medium">{setting.label}</h3>
          <p className="mt-1 text-xs text-gt-muted">{setting.description}</p>
        </div>
        <div className="flex gap-2 text-xs">
          <span className="rounded border border-gt-border px-2 py-1">{setting.source}</span>
          {setting.sensitive && <span className="rounded border border-amber-500/40 px-2 py-1 text-amber-300">Sensitive</span>}
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {typeof setting.value === "boolean" ? (
          <select value={value} onChange={(event) => setValue(event.target.value)} disabled={!allowed}
            className="h-10 rounded-md border border-gt-border bg-gt-surface px-3 text-sm">
            <option value="true">true</option><option value="false">false</option>
          </select>
        ) : setting.key === "purchaseMode" ? (
          <select value={value} onChange={(event) => setValue(event.target.value)} disabled={!allowed}
            className="h-10 rounded-md border border-gt-border bg-gt-surface px-3 text-sm">
            <option value="MARKET">MARKET</option><option value="FOUNDATION_DIRECT">FOUNDATION_DIRECT</option><option value="PAUSED">PAUSED</option>
          </select>
        ) : (
          <input value={value} onChange={(event) => setValue(event.target.value)} disabled={!allowed}
            aria-label={`${setting.label} value`} placeholder={setting.value === null ? "Not set" : undefined}
            className="h-10 rounded-md border border-gt-border bg-gt-surface px-3 text-sm disabled:opacity-60" />
        )}
        <input value={reason} onChange={(event) => setReason(event.target.value)} disabled={!allowed}
          minLength={10} maxLength={500} required placeholder="Reason for change"
          className="h-10 rounded-md border border-gt-border bg-gt-surface px-3 text-sm disabled:opacity-60" />
        {setting.sensitive && (
          <input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} disabled={!allowed}
            required placeholder={setting.confirmationPhrase ?? undefined}
            className="h-10 rounded-md border border-gt-border bg-gt-surface px-3 font-mono text-sm disabled:opacity-60" />
        )}
        <button type="submit" disabled={!allowed || saving}
          className="h-10 rounded-md bg-gt-emerald px-4 text-sm font-semibold text-black disabled:opacity-50">
          {saving ? "Saving…" : allowed ? "Save setting" : "Read only"}
        </button>
      </div>
      {message && <p role="status" className="mt-3 text-sm text-gt-muted">{message}</p>}
    </form>
  );
}

function parseValue(value: string, previous: RuntimeSettingView["value"]) {
  if (previous === null) return value.trim() || null;
  if (typeof previous === "boolean") return value === "true";
  if (typeof previous === "number") return Number(value);
  return value;
}
