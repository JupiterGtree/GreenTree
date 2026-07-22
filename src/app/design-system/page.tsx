import type { Metadata } from "next";
import { Coins, Leaf, TreeDeciduous } from "lucide-react";
import { SectionHeading } from "@/components/shared/section-heading";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { DemoDataBadge, LiveDataBadge } from "@/components/shared/data-badges";
import { MissionStatusBadge } from "@/components/shared/status-badge";

export const metadata: Metadata = {
  title: "Design System",
  robots: { index: false, follow: false },
};

const COLOR_TOKENS = [
  { name: "gt-black", var: "--gt-black" },
  { name: "gt-charcoal", var: "--gt-charcoal" },
  { name: "gt-charcoal-2", var: "--gt-charcoal-2" },
  { name: "gt-surface", var: "--gt-surface" },
  { name: "gt-surface-2", var: "--gt-surface-2" },
  { name: "gt-surface-3", var: "--gt-surface-3" },
  { name: "gt-forest-deep", var: "--gt-forest-deep" },
  { name: "gt-forest", var: "--gt-forest" },
  { name: "gt-emerald", var: "--gt-emerald" },
  { name: "gt-emerald-bright", var: "--gt-emerald-bright" },
  { name: "gt-moss", var: "--gt-moss" },
  { name: "gt-leaf", var: "--gt-leaf" },
  { name: "gt-gold", var: "--gt-gold" },
  { name: "gt-gold-bright", var: "--gt-gold-bright" },
  { name: "gt-offwhite", var: "--gt-offwhite" },
  { name: "gt-muted", var: "--gt-muted" },
  { name: "gt-success", var: "--gt-success" },
  { name: "gt-warning", var: "--gt-warning" },
  { name: "gt-danger", var: "--gt-danger" },
  { name: "gt-info", var: "--gt-info" },
];

export default function DesignSystemPage() {
  return (
    <div className="container-gt flex flex-col gap-16 py-14">
      <SectionHeading
        eyebrow="Internal"
        title="Design System"
        description="Reference for the visual language behind this concept. Not part of the public navigation."
      />

      <section>
        <h2 className="mb-4 font-display text-2xl font-semibold text-gt-offwhite">Colors</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
          {COLOR_TOKENS.map((c) => (
            <div key={c.name} className="overflow-hidden rounded-lg border border-gt-border">
              <div className="h-16" style={{ backgroundColor: `var(${c.var})` }} />
              <div className="bg-gt-surface px-3 py-2">
                <p className="text-xs font-medium text-gt-fg">{c.name}</p>
                <p className="font-mono text-[11px] text-gt-muted-2">{c.var}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-4 font-display text-2xl font-semibold text-gt-offwhite">Typography</h2>
        <div className="flex flex-col gap-4 rounded-lg border border-gt-border bg-gt-surface p-6">
          <p className="font-display text-5xl font-semibold text-gt-offwhite">Fraunces Display</p>
          <p className="font-display text-2xl italic text-gt-leaf">Grow Together. (italic accent)</p>
          <Separator />
          <p className="text-lg font-semibold text-gt-fg">Manrope — Body large</p>
          <p className="text-base text-gt-muted">Manrope — Body default, used for interface copy and descriptions.</p>
          <p className="font-mono text-sm text-gt-muted">Geist Mono — addresses, signatures, tabular data</p>
        </div>
      </section>

      <section>
        <h2 className="mb-4 font-display text-2xl font-semibold text-gt-offwhite">Buttons</h2>
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gt-border bg-gt-surface p-6">
          <Button variant="primary">Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="gold">Gold</Button>
          <Button variant="destructive">Destructive</Button>
          <Button variant="link">Link</Button>
          <Button disabled>Disabled</Button>
        </div>
      </section>

      <section>
        <h2 className="mb-4 font-display text-2xl font-semibold text-gt-offwhite">Badges and status</h2>
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gt-border bg-gt-surface p-6">
          <Badge variant="neutral">Neutral</Badge>
          <Badge variant="emerald">Emerald</Badge>
          <Badge variant="gold">Gold</Badge>
          <Badge variant="warning">Warning</Badge>
          <Badge variant="danger">Danger</Badge>
          <Badge variant="info">Info</Badge>
          <DemoDataBadge />
          <LiveDataBadge />
          <MissionStatusBadge status="in-progress" />
          <MissionStatusBadge status="completed" />
          <MissionStatusBadge status="delayed" />
        </div>
      </section>

      <section>
        <h2 className="mb-4 font-display text-2xl font-semibold text-gt-offwhite">Fields</h2>
        <div className="flex max-w-sm flex-col gap-4 rounded-lg border border-gt-border bg-gt-surface p-6">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ds-input">Amount</Label>
            <Input id="ds-input" placeholder="0.00" />
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-4 font-display text-2xl font-semibold text-gt-offwhite">Cards</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><TreeDeciduous className="size-4 text-gt-emerald-bright" aria-hidden />Card title</CardTitle>
              <CardDescription>A supporting description for this card.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gt-muted">Card body content sits here, using consistent padding and radius.</p>
            </CardContent>
            <CardFooter>
              <Button size="sm">Action</Button>
            </CardFooter>
          </Card>
          <Card className="border-gt-gold/30 bg-gt-gold/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Coins className="size-4 text-gt-gold-bright" aria-hidden />Accent card</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gt-muted">An accent surface variant for gold-tier emphasis.</p>
            </CardContent>
          </Card>
        </div>
      </section>

      <section>
        <h2 className="mb-4 font-display text-2xl font-semibold text-gt-offwhite">Empty, error and loading states</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <EmptyState icon={Leaf} title="Empty state" description="Shown when no records match." />
          <ErrorState />
          <div className="flex flex-col gap-2 rounded-lg border border-dashed border-gt-border bg-gt-surface/60 p-6">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-3/4" />
          </div>
        </div>
      </section>
    </div>
  );
}
