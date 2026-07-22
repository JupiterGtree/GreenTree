"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AdminLoginForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);

    try {
      const response = await fetch("/admin/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.get("email"),
          password: form.get("password"),
        }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(body.error ?? "Sign in failed.");
        return;
      }
      router.replace("/admin");
      router.refresh();
    } catch {
      setError("Sign in is temporarily unavailable.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="space-y-2">
        <label htmlFor="admin-email" className="text-sm font-medium text-gt-fg">
          Email
        </label>
        <Input
          id="admin-email"
          name="email"
          type="email"
          autoComplete="username"
          required
          maxLength={320}
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="admin-password" className="text-sm font-medium text-gt-fg">
          Password
        </label>
        <Input
          id="admin-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          maxLength={1024}
        />
      </div>
      {error ? (
        <p role="alert" className="text-sm text-gt-danger">
          {error}
        </p>
      ) : null}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
