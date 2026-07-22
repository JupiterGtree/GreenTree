import { AtSign, Mail, Send } from "lucide-react";
import { SectionHeading } from "@/components/shared/section-heading";
import { FadeIn } from "@/components/shared/fade-in";
import { PROJECT } from "@/lib/constants/project";

const CONTACT_CATEGORIES = [
  { label: "General", email: PROJECT.contacts.hello },
  { label: "Partnerships", email: PROJECT.contacts.partnerships },
  { label: "Media", email: PROJECT.contacts.media },
  { label: "Legal", email: PROJECT.contacts.legal },
  { label: "Security", email: PROJECT.contacts.security },
] as const;

export function ContactSection() {
  return (
    <section className="bg-gt-charcoal-2/45 py-20 sm:py-24 lg:py-28">
      <div className="container-gt">
        <FadeIn className="grid gap-12 lg:grid-cols-2 lg:gap-20">
          <div className="max-w-xl">
            <SectionHeading
              eyebrow="Contact"
              title="Get in touch."
              description="Use the verified channel that best matches your request. Green Tree does not use a contact form without a real submission backend."
            />

            <div className="mt-8 flex flex-col gap-4">
              <a
                href={`mailto:${PROJECT.contacts.support}`}
                className="group flex items-center gap-3 text-sm text-gt-fg focus-visible:outline-offset-4"
              >
                <Mail className="size-4 text-gt-emerald-bright" aria-hidden />
                <span className="text-gt-muted">Support</span>
                <span className="break-all font-medium group-hover:text-gt-emerald-bright">{PROJECT.contacts.support}</span>
              </a>
              <a
                href={PROJECT.telegram}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-3 text-sm text-gt-fg focus-visible:outline-offset-4"
                aria-label={`Open official Green Tree Telegram ${PROJECT.telegramHandle}`}
              >
                <Send className="size-4 text-gt-info" aria-hidden />
                <span className="text-gt-muted">Telegram</span>
                <span className="font-medium group-hover:text-gt-emerald-bright">{PROJECT.telegramHandle}</span>
              </a>
              <a
                href={PROJECT.officialX}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-3 text-sm text-gt-fg focus-visible:outline-offset-4"
                aria-label={`Open official Green Tree X account ${PROJECT.officialXHandle}`}
              >
                <AtSign className="size-4 text-gt-muted" aria-hidden />
                <span className="text-gt-muted">X</span>
                <span className="font-medium group-hover:text-gt-emerald-bright">{PROJECT.officialXHandle}</span>
              </a>
            </div>
          </div>

          <div className="border-t border-gt-border-soft lg:border-l lg:border-t-0 lg:pl-12">
            <p className="py-4 text-xs font-semibold uppercase tracking-[0.16em] text-gt-muted-2 lg:pt-0">
              Contact directory
            </p>
            <dl className="divide-y divide-gt-border-soft border-y border-gt-border-soft">
              {CONTACT_CATEGORIES.map((contact) => (
                <div key={contact.label} className="grid gap-1 py-4 sm:grid-cols-[8rem_1fr] sm:items-center sm:gap-4">
                  <dt className="text-sm text-gt-muted">{contact.label}</dt>
                  <dd className="min-w-0 sm:text-right">
                    <a
                      href={`mailto:${contact.email}`}
                      className="break-all text-sm font-medium text-gt-fg hover:text-gt-emerald-bright hover:underline"
                    >
                      {contact.email}
                    </a>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
