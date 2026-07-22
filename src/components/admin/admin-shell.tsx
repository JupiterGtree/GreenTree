"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  BookOpenText,
  ChevronRight,
  FileClock,
  Handshake,
  HeartPulse,
  LayoutDashboard,
  Menu,
  MessageCircle,
  Newspaper,
  Settings2,
  Users,
} from "lucide-react";
import { AdminSessionControls } from "@/app/admin/(protected)/session-controls";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { AdminRole } from "@/lib/admin/database";
import { cn } from "@/lib/utils";

type NavItem = {
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
  permission?: "partnerships" | "support" | "settings" | "audit" | "users";
};

const NAVIGATION: NavItem[] = [
  { label: "Overview", href: "/admin", icon: LayoutDashboard },
  { label: "Purchase Operations", href: "/admin/purchase-control", icon: Settings2 },
  { label: "Transactions", href: "/admin/transactions", icon: Activity },
  { label: "News & Updates", href: "/admin/news", icon: Newspaper },
  { label: "Partnerships", href: "/admin/partnerships", icon: Handshake, permission: "partnerships" },
  { label: "Support", href: "/admin/support", icon: MessageCircle, permission: "support" },
  { label: "Site Content", href: "/admin/site-content", icon: BookOpenText, permission: "settings" },
  { label: "System Health", href: "/admin/system", icon: HeartPulse },
  { label: "Audit Log", href: "/admin/audit", icon: FileClock, permission: "audit" },
  { label: "Admin Users", href: "/admin/users", icon: Users, permission: "users" },
];

export function AdminShell({
  children,
  identity,
  role,
  csrfToken,
  permissions,
}: {
  children: React.ReactNode;
  identity: string;
  role: AdminRole;
  csrfToken: string;
  permissions: Record<NonNullable<NavItem["permission"]>, boolean>;
}) {
  const pathname = usePathname();
  const items = NAVIGATION.filter((item) => !item.permission || permissions[item.permission]);
  const current = [...items]
    .sort((a, b) => b.href.length - a.href.length)
    .find((item) => item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href));
  const detail = current && pathname !== current.href
    ? pathname.split("/").filter(Boolean).at(-1)
    : null;

  return (
    <div
      data-admin-shell
      className="fixed inset-0 z-40 min-h-screen overflow-y-auto bg-gt-black lg:grid lg:grid-cols-[248px_minmax(0,1fr)]"
    >
      <a
        href="#admin-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-md focus:bg-gt-emerald focus:px-4 focus:py-2 focus:font-semibold focus:text-gt-black"
      >
        Skip to admin content
      </a>
      <aside className="hidden border-r border-gt-border bg-gt-charcoal-2/95 lg:sticky lg:top-0 lg:block lg:h-screen">
        <Sidebar items={items} pathname={pathname} identity={identity} role={role} csrfToken={csrfToken} />
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-40 flex min-h-16 items-center gap-3 border-b border-gt-border bg-gt-charcoal/90 px-4 backdrop-blur-xl sm:px-6">
          <Dialog>
            <DialogTrigger asChild>
              <button
                type="button"
                className="inline-flex size-10 items-center justify-center rounded-md border border-gt-border text-gt-fg hover:bg-gt-surface lg:hidden"
                aria-label="Open admin navigation"
              >
                <Menu className="size-5" aria-hidden />
              </button>
            </DialogTrigger>
            <DialogContent
              showClose
              className="left-0 top-0 h-dvh w-[min(88vw,320px)] max-w-none translate-x-0 translate-y-0 rounded-none border-y-0 border-l-0 p-0"
            >
              <DialogTitle className="sr-only">Admin navigation</DialogTitle>
              <DialogDescription className="sr-only">
                Navigate between Green Tree administration areas.
              </DialogDescription>
              <Sidebar
                items={items}
                pathname={pathname}
                identity={identity}
                role={role}
                csrfToken={csrfToken}
                mobile
              />
            </DialogContent>
          </Dialog>

          <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
            <ol className="flex min-w-0 items-center gap-1.5 text-sm">
              <li><Link href="/admin" className="text-gt-muted hover:text-gt-fg">Admin</Link></li>
              {current?.href !== "/admin" && (
                <>
                  <li><ChevronRight className="size-3.5 text-gt-muted-2" aria-hidden /></li>
                  <li className="truncate font-medium text-gt-fg">{current?.label ?? "Administration"}</li>
                </>
              )}
              {detail && (
                <>
                  <li className="hidden sm:block"><ChevronRight className="size-3.5 text-gt-muted-2" aria-hidden /></li>
                  <li className="hidden max-w-40 truncate text-gt-muted sm:block">{detail}</li>
                </>
              )}
            </ol>
          </nav>

          <div className="hidden items-center gap-2 sm:flex lg:hidden">
            <span className="max-w-48 truncate text-xs text-gt-muted">{identity}</span>
            <span className="rounded-full bg-gt-emerald/10 px-2 py-1 text-[10px] font-bold text-gt-emerald-bright">
              {role}
            </span>
          </div>
          <Link
            href="/"
            className="hidden rounded-md border border-gt-border px-3 py-2 text-xs font-medium text-gt-muted hover:bg-gt-surface hover:text-gt-fg xl:inline-flex"
          >
            View site
          </Link>
        </header>

        <main id="admin-content" tabIndex={-1} className="mx-auto w-full max-w-[1500px] p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}

function Sidebar({
  items,
  pathname,
  identity,
  role,
  csrfToken,
  mobile = false,
}: {
  items: NavItem[];
  pathname: string;
  identity: string;
  role: AdminRole;
  csrfToken: string;
  mobile?: boolean;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-gt-border px-5 py-5">
        <Link href="/admin" className="text-base font-semibold tracking-tight text-gt-offwhite">
          Green Tree Admin
        </Link>
        <p className="mt-1 text-xs text-gt-muted">Operations console</p>
      </div>
      <nav aria-label="Admin navigation" className="flex-1 overflow-y-auto p-3">
        <ul className="space-y-1">
          {items.map((item) => {
            const active = item.href === "/admin" ? pathname === item.href : pathname.startsWith(item.href);
            const link = (
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-gt-emerald-bright",
                  active
                    ? "bg-gt-emerald/12 text-gt-emerald-bright"
                    : "text-gt-muted hover:bg-gt-surface hover:text-gt-fg",
                )}
              >
                <item.icon className="size-4 shrink-0" aria-hidden />
                {item.label}
              </Link>
            );
            return <li key={item.href}>{mobile ? <DialogClose asChild>{link}</DialogClose> : link}</li>;
          })}
        </ul>
      </nav>
      <div className="border-t border-gt-border p-4">
        <p className="truncate text-sm font-medium text-gt-fg">{identity}</p>
        <div className="mt-1 flex items-center justify-between gap-2">
          <span className="rounded-full bg-gt-emerald/10 px-2 py-1 text-[10px] font-bold tracking-wider text-gt-emerald-bright">
            {role}
          </span>
          <AdminSessionControls initialCsrfToken={csrfToken} compact />
        </div>
      </div>
    </div>
  );
}
