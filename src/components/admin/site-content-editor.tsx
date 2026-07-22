"use client";

import { useState } from "react";
import type { SiteContentSettings, SiteContentView } from "@/lib/admin/site-content";

interface NewsOption {
  id: string;
  title: string;
}

export function SiteContentEditor({
  initial,
  news,
  csrfToken,
}: {
  initial: SiteContentView;
  news: NewsOption[];
  csrfToken: string;
}) {
  const [settings, setSettings] = useState<SiteContentSettings>(stripView(initial));
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [persistedMissionsEnabled, setPersistedMissionsEnabled] = useState(initial.environmentalMissionsStoredEnabled);
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setStatus(null);
    try {
      const response = await fetch("/admin/api/site-content", {
        method: "PUT",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ settings, reason, confirmation }),
      });
      const body = await response.json() as { settings?: SiteContentView; error?: string };
      if (!response.ok || !body.settings) throw new Error(body.error ?? "Unable to save site content.");
      setSettings(stripView(body.settings));
      setPersistedMissionsEnabled(body.settings.environmentalMissionsStoredEnabled);
      setReason("");
      setConfirmation("");
      setStatus("Saved and published.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to save site content.");
    } finally {
      setSaving(false);
    }
  }

  const inputClass =
    "mt-2 w-full rounded-md border border-gt-border bg-gt-charcoal px-3 py-2 text-sm text-gt-fg outline-none focus:border-gt-emerald-bright focus:ring-2 focus:ring-gt-emerald/25";

  return (
    <form onSubmit={save} className="space-y-6">
      <fieldset className="rounded-lg border border-gt-border bg-gt-charcoal/45 p-4 sm:p-5">
        <legend className="px-2 font-semibold">Environmental missions</legend>
        <Toggle
          checked={settings.environmentalMissionsEnabled}
          disabled={initial.environmentalMissionsEnvironmentOverride}
          onChange={(environmentalMissionsEnabled) => setSettings({
            ...settings,
            environmentalMissionsEnabled,
          })}
          label="Enable environmental mission interactions"
        />
        <p className="mt-3 text-xs text-gt-muted">
          Disabled is the Foundation-phase safe default. The public examples remain visible, but filters,
          cards, and mission details are locked.
          {initial.environmentalMissionsEnvironmentOverride && " An environment override currently controls this setting."}
        </p>
        {settings.environmentalMissionsEnabled && !persistedMissionsEnabled && (
          <TextInput
            label='Type "ENABLE ENVIRONMENTAL MISSIONS" to confirm'
            value={confirmation}
            maxLength={29}
            onChange={setConfirmation}
          />
        )}
      </fieldset>

      <fieldset className="rounded-lg border border-gt-border bg-gt-charcoal/45 p-4 sm:p-5">
        <legend className="px-2 font-semibold">Site banner</legend>
        <Toggle
          checked={settings.banner.enabled}
          onChange={(enabled) => setSettings({ ...settings, banner: { ...settings.banner, enabled } })}
          label="Show banner"
        />
        <label className="mt-4 block text-sm">
          Banner type
          <select
            className={inputClass}
            value={settings.banner.tone}
            onChange={(event) => setSettings({
              ...settings,
              banner: { ...settings.banner, tone: event.target.value as "NOTICE" | "MAINTENANCE" },
            })}
          >
            <option value="NOTICE">Notice</option>
            <option value="MAINTENANCE">Maintenance</option>
          </select>
        </label>
        <TextArea
          label="Banner message"
          value={settings.banner.message}
          maxLength={300}
          onChange={(message) => setSettings({ ...settings, banner: { ...settings.banner, message } })}
        />
      </fieldset>

      <fieldset className="rounded-lg border border-gt-border bg-gt-charcoal/45 p-4 sm:p-5">
        <legend className="px-2 font-semibold">Home hero</legend>
        <TextInput
          label="Title"
          value={settings.hero.title}
          maxLength={100}
          onChange={(title) => setSettings({ ...settings, hero: { ...settings.hero, title } })}
        />
        <TextArea
          label="Subtitle"
          value={settings.hero.subtitle}
          maxLength={300}
          onChange={(subtitle) => setSettings({ ...settings, hero: { ...settings.hero, subtitle } })}
        />
      </fieldset>

      <fieldset className="rounded-lg border border-gt-border bg-gt-charcoal/45 p-4 sm:p-5">
        <legend className="px-2 font-semibold">Home sections</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <Toggle
            checked={settings.home.transparencyVisible}
            onChange={(transparencyVisible) => setSettings({
              ...settings,
              home: { ...settings.home, transparencyVisible },
            })}
            label="Transparency preview"
          />
          <Toggle
            checked={settings.home.latestNewsVisible}
            onChange={(latestNewsVisible) => setSettings({
              ...settings,
              home: { ...settings.home, latestNewsVisible },
            })}
            label="Latest news"
          />
          <Toggle
            checked={settings.home.partnershipsVisible}
            onChange={(partnershipsVisible) => setSettings({
              ...settings,
              home: { ...settings.home, partnershipsVisible },
            })}
            label="Partnership invitation"
          />
        </div>
      </fieldset>

      <fieldset className="rounded-lg border border-gt-border bg-gt-charcoal/45 p-4 sm:p-5">
        <legend className="px-2 font-semibold">Featured news</legend>
        <p className="mb-3 text-sm text-gt-muted">
          Choose up to three published posts. With no selection, the latest three are shown.
        </p>
        <div className="space-y-2">
          {news.map((post) => (
            <label key={post.id} className="flex items-start gap-3 rounded-md border border-gt-border-soft p-3 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 size-4 accent-gt-emerald"
                checked={settings.featuredNewsIds.includes(post.id)}
                disabled={!settings.featuredNewsIds.includes(post.id) && settings.featuredNewsIds.length >= 3}
                onChange={(event) => setSettings({
                  ...settings,
                  featuredNewsIds: event.target.checked
                    ? [...settings.featuredNewsIds, post.id]
                    : settings.featuredNewsIds.filter((id) => id !== post.id),
                })}
              />
              {post.title}
            </label>
          ))}
          {!news.length && <p className="text-sm text-gt-muted">No published posts are available.</p>}
        </div>
      </fieldset>

      <fieldset className="rounded-lg border border-gt-border bg-gt-charcoal/45 p-4 sm:p-5">
        <legend className="px-2 font-semibold">Footer and social links</legend>
        <TextArea
          label="Footer text"
          value={settings.footer.description}
          maxLength={300}
          onChange={(description) => setSettings({ ...settings, footer: { ...settings.footer, description } })}
        />
        <TextInput
          label="Telegram URL"
          type="url"
          value={settings.footer.telegramUrl}
          maxLength={300}
          onChange={(telegramUrl) => setSettings({ ...settings, footer: { ...settings.footer, telegramUrl } })}
        />
        <TextInput
          label="Support email"
          type="email"
          value={settings.footer.supportEmail}
          maxLength={254}
          onChange={(supportEmail) => setSettings({ ...settings, footer: { ...settings.footer, supportEmail } })}
        />
        <p className="mt-3 text-xs text-gt-muted">
          Official X is fixed and cannot be changed here: {initial.fixedXUrl}
        </p>
      </fieldset>

      <fieldset className="rounded-lg border border-gt-border bg-gt-charcoal/45 p-4 sm:p-5">
        <legend className="px-2 font-semibold">Market warning</legend>
        <TextArea
          label="Risk notice shown with market purchase interfaces"
          value={settings.marketWarning}
          maxLength={600}
          onChange={(marketWarning) => setSettings({ ...settings, marketWarning })}
        />
      </fieldset>

      <div className="rounded-lg border border-gt-border bg-gt-surface/70 p-4">
        <TextArea
          label="Reason for change"
          value={reason}
          maxLength={500}
          onChange={setReason}
          hint="Required, 10–500 characters. The reason and changed sections are added to the audit log."
        />
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-gt-emerald px-4 py-2 text-sm font-semibold text-gt-black hover:bg-gt-emerald-bright disabled:opacity-50"
          >
            {saving ? "Publishing…" : "Publish changes"}
          </button>
          {status && <p role="status" aria-live="polite" className="text-sm text-gt-muted">{status}</p>}
        </div>
      </div>
    </form>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <label className="flex min-h-11 items-center gap-3 rounded-md border border-gt-border-soft px-3 py-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="size-4 accent-gt-emerald disabled:cursor-not-allowed disabled:opacity-50"
      />
      {label}
    </label>
  );
}

function TextInput({
  label,
  value,
  onChange,
  type = "text",
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "url" | "email";
  maxLength: number;
}) {
  return (
    <label className="mt-4 block text-sm">
      {label}
      <input
        type={type}
        value={value}
        maxLength={maxLength}
        required
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-md border border-gt-border bg-gt-charcoal px-3 py-2 text-sm outline-none focus:border-gt-emerald-bright focus:ring-2 focus:ring-gt-emerald/25"
      />
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange,
  maxLength,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  hint?: string;
}) {
  return (
    <label className="mt-4 block text-sm">
      {label}
      <textarea
        value={value}
        maxLength={maxLength}
        rows={3}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full resize-y rounded-md border border-gt-border bg-gt-charcoal px-3 py-2 text-sm outline-none focus:border-gt-emerald-bright focus:ring-2 focus:ring-gt-emerald/25"
      />
      {hint && <span className="mt-1 block text-xs text-gt-muted">{hint}</span>}
    </label>
  );
}

function stripView(view: SiteContentView): SiteContentSettings {
  return {
    environmentalMissionsEnabled: view.environmentalMissionsStoredEnabled,
    banner: view.banner,
    hero: view.hero,
    home: view.home,
    featuredNewsIds: view.featuredNewsIds,
    footer: view.footer,
    marketWarning: view.marketWarning,
  };
}
