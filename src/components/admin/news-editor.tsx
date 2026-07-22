"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { SafeMarkdown } from "@/components/news/safe-markdown";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { NewsPost } from "@/lib/news/repository";

export function NewsEditor({
  post,
  csrfToken,
  canWrite,
}: {
  post?: NewsPost;
  csrfToken: string;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [body, setBody] = useState(post?.body ?? "");
  const [preview, setPreview] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canWrite) return;
    const form = new FormData(event.currentTarget);
    const payload = {
      title: String(form.get("title") ?? ""),
      slug: String(form.get("slug") ?? ""),
      excerpt: String(form.get("excerpt") ?? ""),
      body,
      category: String(form.get("category") ?? ""),
      tags: String(form.get("tags") ?? "").split(","),
      coverImage: String(form.get("coverImage") ?? ""),
      featured: form.get("featured") === "on",
      seoTitle: String(form.get("seoTitle") ?? ""),
      seoDescription: String(form.get("seoDescription") ?? ""),
      ogTitle: String(form.get("ogTitle") ?? ""),
      ogDescription: String(form.get("ogDescription") ?? ""),
      ogImage: String(form.get("ogImage") ?? ""),
    };
    setBusy(true);
    setMessage("");
    const response = await fetch(post ? `/admin/api/news/${post.id}` : "/admin/api/news", {
      method: post ? "PATCH" : "POST",
      headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
      body: JSON.stringify(post ? { action: "edit", post: payload } : payload),
    });
    const result = await response.json() as { error?: string; post?: NewsPost };
    setBusy(false);
    if (!response.ok || !result.post) {
      setMessage(result.error ?? "Unable to save.");
      return;
    }
    setMessage("Saved.");
    if (!post) router.replace(`/admin/news/${result.post.id}`);
    router.refresh();
  }

  async function action(name: "publish" | "unpublish" | "schedule" | "archive" | "duplicate") {
    if (!post || !canWrite) return;
    let scheduledAt: number | undefined;
    if (name === "schedule") {
      const supplied = window.prompt("Schedule time (local date/time, e.g. 2026-08-01T09:00)");
      if (!supplied) return;
      scheduledAt = new Date(supplied).getTime();
    }
    setBusy(true);
    setMessage("");
    const response = await fetch(`/admin/api/news/${post.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
      body: JSON.stringify({ action: name, scheduledAt }),
    });
    const result = await response.json() as { error?: string; post?: NewsPost };
    setBusy(false);
    if (!response.ok || !result.post) {
      setMessage(result.error ?? "Unable to update status.");
      return;
    }
    if (name === "duplicate") router.push(`/admin/news/${result.post.id}`);
    setMessage("Status updated.");
    router.refresh();
  }

  const disabled = busy || !canWrite;
  const textAreaClass = "w-full rounded-md border border-gt-border bg-gt-surface/75 px-3 py-2 text-sm text-gt-fg placeholder:text-gt-muted-2 disabled:opacity-50";
  return (
    <div>
      {post && (
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-gt-surface px-3 py-1 text-xs font-semibold">{post.status}</span>
          <Button size="sm" onClick={() => action("publish")} disabled={disabled}>Publish</Button>
          <Button size="sm" variant="outline" onClick={() => action("schedule")} disabled={disabled}>Schedule</Button>
          <Button size="sm" variant="outline" onClick={() => action("unpublish")} disabled={disabled}>Unpublish</Button>
          <Button size="sm" variant="outline" onClick={() => action("archive")} disabled={disabled}>Archive</Button>
          <Button size="sm" variant="ghost" onClick={() => action("duplicate")} disabled={disabled}>Duplicate</Button>
        </div>
      )}
      {!canWrite && <p className="mb-5 rounded-md border border-gt-border p-3 text-sm text-gt-muted">Viewer access is read-only.</p>}
      <form onSubmit={submit} className="space-y-5">
        <Field label="Title"><Input name="title" required minLength={3} maxLength={180} defaultValue={post?.title} disabled={!canWrite} /></Field>
        <Field label="Slug"><Input name="slug" defaultValue={post?.slug} placeholder="generated-from-title" disabled={!canWrite} /></Field>
        <Field label="Excerpt"><textarea name="excerpt" rows={3} maxLength={500} defaultValue={post?.excerpt ?? ""} className={textAreaClass} disabled={!canWrite} /></Field>
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label htmlFor="news-body" className="text-sm font-medium">Body (Markdown)</label>
            <Button type="button" size="sm" variant="ghost" onClick={() => setPreview((value) => !value)}>
              {preview ? "Edit" : "Preview"}
            </Button>
          </div>
          {preview ? (
            <div className="min-h-64 rounded-md border border-gt-border p-5"><SafeMarkdown source={body} /></div>
          ) : (
            <textarea id="news-body" rows={16} value={body} onChange={(event) => setBody(event.target.value)} className={`${textAreaClass} font-mono`} disabled={!canWrite} required />
          )}
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Category"><Input name="category" defaultValue={post?.category ?? ""} disabled={!canWrite} /></Field>
          <Field label="Tags (comma-separated)"><Input name="tags" defaultValue={post?.tags.map((tag) => tag.name).join(", ")} disabled={!canWrite} /></Field>
          <Field label="Cover image URL"><Input name="coverImage" defaultValue={post?.coverImage ?? ""} disabled={!canWrite} /></Field>
          <Field label="Open Graph image URL"><Input name="ogImage" defaultValue={post?.ogImage ?? ""} disabled={!canWrite} /></Field>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="featured" defaultChecked={post?.featured} disabled={!canWrite} /> Featured</label>
        <details className="rounded-md border border-gt-border p-4">
          <summary className="cursor-pointer font-medium">SEO and social metadata</summary>
          <div className="mt-4 grid gap-4">
            <Field label="SEO title"><Input name="seoTitle" maxLength={70} defaultValue={post?.seoTitle ?? ""} disabled={!canWrite} /></Field>
            <Field label="SEO description"><textarea name="seoDescription" rows={2} maxLength={170} defaultValue={post?.seoDescription ?? ""} className={textAreaClass} disabled={!canWrite} /></Field>
            <Field label="Open Graph title"><Input name="ogTitle" maxLength={100} defaultValue={post?.ogTitle ?? ""} disabled={!canWrite} /></Field>
            <Field label="Open Graph description"><textarea name="ogDescription" rows={2} maxLength={250} defaultValue={post?.ogDescription ?? ""} className={textAreaClass} disabled={!canWrite} /></Field>
          </div>
        </details>
        <div className="flex items-center gap-4">
          <Button type="submit" disabled={disabled}>{busy ? "Saving…" : "Save draft content"}</Button>
          <span role="status" className="text-sm text-gt-muted">{message}</span>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-sm font-medium">{label}<span className="mt-2 block">{children}</span></label>;
}
