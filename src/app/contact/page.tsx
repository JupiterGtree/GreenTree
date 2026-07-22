import type { Metadata } from "next";
import Image from "next/image";
import { Clock3, ExternalLink, Handshake, Mail, MessageCircle, Send, ShieldCheck } from "lucide-react";
import { XIcon } from "@/components/shared/x-icon";
import { SupportContactForm } from "@/features/contact/support-contact-form";

export const metadata: Metadata = {
  title: "Contact Us",
  description: "Verified Green Tree social channels, support email, partnerships, and security contact information.",
};

const SOCIAL_CHANNELS = [
  { label: "Green Tree", handle: "@GreenTreedHQ", href: "https://x.com/GreenTreedHQ", description: "Official project updates and public announcements." },
  { label: "Green Tree Labs", handle: "@GreenTree_Labs", href: "https://x.com/GreenTree_Labs", description: "Research, product, and technical development updates." },
  { label: "Green Tree Core", handle: "@GreenTreecore", href: "https://x.com/GreenTreecore", description: "Core ecosystem communication and operational notices." },
] as const;

const EMAIL_CHANNELS = [
  {
    label: "Support",
    email: "support@gtree.land",
    icon: MessageCircle,
    description: "Purchase questions, wallet and transaction issues, website support, and general assistance.",
  },
  {
    label: "Partnerships",
    email: "partnerships@gtree.land",
    icon: Handshake,
    description: "Environmental organizations, technology teams, media collaboration, and strategic proposals.",
  },
  {
    label: "Security",
    email: "security@gtree.land",
    icon: ShieldCheck,
    description: "Responsible disclosure of vulnerabilities, account-security concerns, and security incidents.",
  },
] as const;

export default function ContactPage() {
  return (
    <main className="bg-gt-charcoal-2/45 pb-20">
      <section className="border-b border-gt-border bg-[radial-gradient(circle_at_72%_18%,rgba(32,178,170,0.14),transparent_32%),linear-gradient(180deg,rgba(20,34,35,0.8),rgba(12,21,22,0.54))]">
        <div className="container-gt grid gap-10 py-14 sm:py-20 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-center lg:py-24">
          <div className="max-w-3xl">
            <div className="flex items-center gap-3">
              <Image src="/logo.png" alt="Green Tree" width={52} height={52} className="rounded-full" priority />
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gt-emerald-bright">Green Tree contact</p>
            </div>
            <h1 className="mt-6 text-balance text-4xl font-semibold tracking-tight text-gt-fg sm:text-5xl">Speak with the Green Tree team.</h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-gt-muted sm:text-lg">
              Our specialist team monitors Green Tree systems around the clock. Use the verified channel that fits your request; when email is needed, we usually respond in under six hours.
            </p>
          </div>
          <div className="glass-surface-a rounded-lg p-5">
            <Clock3 className="size-5 text-gt-emerald-bright" aria-hidden />
            <p className="mt-4 text-sm font-semibold text-gt-fg">24/7 monitoring</p>
            <p className="mt-2 text-sm leading-6 text-gt-muted">Operational and support channels are monitored continuously by our specialists.</p>
            <p className="mt-4 border-t border-gt-border-soft pt-4 text-xs font-medium text-gt-emerald-bright">Typical email response: under 6 hours</p>
          </div>
        </div>
      </section>

      <section className="container-gt py-14 sm:py-20">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gt-emerald-bright">Official channels</p>
            <h2 className="mt-2 text-2xl font-semibold text-gt-fg">Follow verified public updates.</h2>
          </div>
          <p className="max-w-md text-sm leading-6 text-gt-muted">Use only the accounts listed here when verifying project communications.</p>
        </div>

        <div className="mt-8 grid gap-px overflow-hidden rounded-lg border border-gt-border bg-gt-border sm:grid-cols-2 lg:grid-cols-4">
          {SOCIAL_CHANNELS.map((channel) => (
            <a key={channel.handle} href={channel.href} target="_blank" rel="noopener noreferrer" className="group min-w-0 bg-gt-charcoal-2 p-5 transition-colors hover:bg-gt-surface">
              <span className="flex size-9 items-center justify-center rounded-md border border-gt-border bg-gt-surface text-gt-emerald-bright"><XIcon className="size-4" /></span>
              <p className="mt-5 text-sm font-semibold text-gt-fg">{channel.label}</p>
              <p className="mt-1 text-sm text-gt-emerald-bright">{channel.handle}</p>
              <p className="mt-3 text-xs leading-5 text-gt-muted">{channel.description}</p>
              <span className="mt-5 inline-flex items-center gap-1 text-xs font-medium text-gt-fg group-hover:text-gt-emerald-bright">Open X <ExternalLink className="size-3" aria-hidden /></span>
            </a>
          ))}
          <a href="https://t.me/Gttofficial" target="_blank" rel="noopener noreferrer" className="group min-w-0 bg-gt-charcoal-2 p-5 transition-colors hover:bg-gt-surface">
            <span className="flex size-9 items-center justify-center rounded-md border border-gt-border bg-gt-surface text-gt-info"><Send className="size-4" aria-hidden /></span>
            <p className="mt-5 text-sm font-semibold text-gt-fg">Official Telegram</p>
            <p className="mt-1 text-sm text-gt-emerald-bright">@Gttofficial</p>
            <p className="mt-3 text-xs leading-5 text-gt-muted">Community updates and the official Green Tree Telegram channel.</p>
            <span className="mt-5 inline-flex items-center gap-1 text-xs font-medium text-gt-fg group-hover:text-gt-emerald-bright">Open Telegram <ExternalLink className="size-3" aria-hidden /></span>
          </a>
        </div>
      </section>

      <section className="border-y border-gt-border bg-gt-charcoal/55 py-14 sm:py-20">
        <div className="container-gt">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gt-emerald-bright">Email directory</p>
          <h2 className="mt-2 text-2xl font-semibold text-gt-fg">Email the right team.</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-gt-muted">For requests that need a written record, email the relevant team directly. We usually respond within six hours.</p>
          <div className="mt-8 grid gap-4 lg:grid-cols-3">
            {EMAIL_CHANNELS.map((channel) => {
              const Icon = channel.icon;
              return (
                <article key={channel.email} className="surface-card rounded-lg p-5">
                  <Icon className="size-5 text-gt-emerald-bright" aria-hidden />
                  <h3 className="mt-5 text-lg font-semibold text-gt-fg">{channel.label}</h3>
                  <p className="mt-2 text-sm leading-6 text-gt-muted">{channel.description}</p>
                  <a href={`mailto:${channel.email}`} className="mt-5 inline-flex max-w-full items-center gap-2 break-all text-sm font-medium text-gt-emerald-bright hover:text-gt-offwhite">
                    <Mail className="size-4 shrink-0" aria-hidden /> {channel.email}
                  </a>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="container-gt py-14 sm:py-20">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:items-start">
          <div className="max-w-xl">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gt-emerald-bright">Direct support</p>
            <h2 className="mt-2 text-3xl font-semibold text-gt-fg">Send a support request.</h2>
            <p className="mt-4 text-sm leading-7 text-gt-muted">Tell us what happened and include only information that helps us investigate. Never send a seed phrase, private key, or wallet recovery phrase.</p>
          </div>
          <SupportContactForm />
        </div>
      </section>
    </main>
  );
}
