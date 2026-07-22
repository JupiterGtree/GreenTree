"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const ADMIN_ROLES = ["OWNER", "ADMIN", "EDITOR", "VIEWER"] as const;
interface AdminUserView {
  id: string; email: string; role: typeof ADMIN_ROLES[number]; displayName: string | null;
  isActive: boolean; activeSessions: number;
}

export function UserManagement({ users, csrfToken }: { users: AdminUserView[]; csrfToken: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function request(path: string, method: "POST" | "PATCH", body: Record<string, unknown>) {
    setPending(true);
    setError("");
    try {
      const response = await fetch(path, {
        method,
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify(body),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "The request could not be completed.");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The request could not be completed.");
    } finally {
      setPending(false);
    }
  }

  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    void request("/admin/api/users", "POST", {
      email: data.get("email"), displayName: data.get("displayName"),
      role: data.get("role"), passwordHash: data.get("passwordHash"),
    }).then(() => form.reset());
  }

  return (
    <div className="space-y-8">
      <form onSubmit={create} className="rounded-lg border border-gt-border bg-gt-surface/40 p-5">
        <h2 className="text-lg font-semibold">Create admin user</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <Input name="email" type="email" required maxLength={320} placeholder="Email address" autoComplete="off" />
          <Input name="displayName" maxLength={100} placeholder="Display name (optional)" />
          <select name="role" required defaultValue="VIEWER" className="h-10 rounded-md border border-gt-border bg-gt-surface px-3 text-sm">
            {ADMIN_ROLES.map((role) => <option key={role}>{role}</option>)}
          </select>
          <Input
            name="passwordHash" required maxLength={500} autoComplete="off"
            placeholder="scrypt$v=1$N=131072$r=8$p=1$..."
            aria-label="Encoded scrypt password hash"
          />
        </div>
        <p className="mt-3 text-xs text-gt-muted">Only a pre-generated encoded scrypt hash is accepted. Never paste a plaintext password.</p>
        <Button className="mt-4" type="submit" disabled={pending}>Create user</Button>
      </form>

      <div className="overflow-x-auto rounded-lg border border-gt-border">
        <table className="w-full min-w-[940px] text-left text-sm">
          <thead className="bg-gt-surface text-xs uppercase tracking-wide text-gt-muted">
            <tr><th className="p-3">User</th><th className="p-3">Role</th><th className="p-3">Status</th><th className="p-3">Sessions</th><th className="p-3">Password hash</th><th className="p-3">Actions</th></tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-t border-gt-border align-top">
                <td className="p-3"><div className="font-medium">{user.email}</div><div className="text-xs text-gt-muted">{user.displayName || "No display name"}</div></td>
                <td className="p-3">
                  <select
                    value={user.role} disabled={pending}
                    onChange={(event) => void request(`/admin/api/users/${user.id}`, "PATCH", { action: "update", role: event.target.value })}
                    className="h-9 rounded-md border border-gt-border bg-gt-surface px-2"
                  >
                    {ADMIN_ROLES.map((role) => <option key={role}>{role}</option>)}
                  </select>
                </td>
                <td className="p-3">{user.isActive ? "Active" : "Inactive"}</td>
                <td className="p-3">{user.activeSessions}</td>
                <td className="p-3">
                  <form
                    className="flex gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const form = event.currentTarget;
                      const hash = String(new FormData(form).get("passwordHash") ?? "");
                      void request(`/admin/api/users/${user.id}`, "PATCH", { action: "update", passwordHash: hash }).then(() => form.reset());
                    }}
                  >
                    <Input name="passwordHash" required maxLength={500} placeholder="Encoded scrypt hash" className="w-48" />
                    <Button size="sm" variant="outline" disabled={pending}>Replace</Button>
                  </form>
                </td>
                <td className="p-3">
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" disabled={pending} onClick={() => void request(`/admin/api/users/${user.id}`, "PATCH", { action: "revokeSessions" })}>Revoke sessions</Button>
                    <Button size="sm" variant={user.isActive ? "destructive" : "outline"} disabled={pending} onClick={() => void request(`/admin/api/users/${user.id}`, "PATCH", { action: "update", isActive: !user.isActive })}>{user.isActive ? "Deactivate" : "Activate"}</Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
    </div>
  );
}
