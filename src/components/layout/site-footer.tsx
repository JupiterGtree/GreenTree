import Image from "next/image";
import Link from "next/link";
import { Mail, Send } from "lucide-react";
import { XIcon } from "@/components/shared/x-icon";
import { NAV_LINKS, PROJECT } from "@/lib/constants/project";
import { getSiteContent } from "@/lib/admin/site-content";

export function SiteFooter() {
  const { footer, fixedXUrl } = getSiteContent();
  return (
    <footer className="border-t border-gt-border bg-gt-black">
      <div className="container-gt py-10 sm:py-12">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-sm">
            <Link href="/" className="inline-flex items-center gap-2.5" aria-label="Green Tree homepage">
              <Image src="/logo.png" alt="" width={52} height={52} className="size-[52px] shrink-0 rounded-full" />
              <span className="font-display text-lg font-semibold text-gt-offwhite">Green Tree</span>
            </Link>
            <p className="mt-3 text-sm leading-relaxed text-gt-muted">
              {footer.description}
            </p>
          </div>

          <nav aria-label="Footer navigation" className="lg:max-w-2xl">
            <ul className="flex flex-wrap gap-x-6 gap-y-3">
              {NAV_LINKS.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm text-gt-muted transition-colors hover:text-gt-emerald-bright">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="mt-9 flex flex-col gap-5 border-t border-gt-border-soft pt-6 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-x-5 gap-y-3 text-sm">
            <a
              href={fixedXUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-gt-muted hover:text-gt-emerald-bright"
              aria-label={`Official Green Tree X account ${PROJECT.officialXHandle}`}
            >
              <XIcon className="size-3.5" /> {PROJECT.officialXHandle}
            </a>
            <a
              href={footer.telegramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-gt-muted hover:text-gt-emerald-bright"
              aria-label={`Official Green Tree Telegram ${PROJECT.telegramHandle}`}
            >
              <Send className="size-3.5" aria-hidden /> Telegram
            </a>
            <a
              href={`mailto:${footer.supportEmail}`}
              className="inline-flex items-center gap-1.5 text-gt-muted hover:text-gt-emerald-bright"
            >
              <Mail className="size-3.5" aria-hidden /> {footer.supportEmail}
            </a>
          </div>

          <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-gt-muted-2">
            <Link href="/docs" className="hover:text-gt-fg">Documents</Link>
            <Link href="/docs#token-market-policy" className="hover:text-gt-fg">Token policy</Link>
            <Link href="/docs#transparency-reporting-policy" className="hover:text-gt-fg">Reporting policy</Link>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-2 text-xs text-gt-muted-2 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Green Tree. All rights reserved.</p>
          <p>Solana Mainnet · Document version {PROJECT.docVersion}</p>
        </div>
      </div>
    </footer>
  );
}
