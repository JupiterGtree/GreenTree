import type { Metadata, Viewport } from "next";
import { DM_Sans, Sora, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteNotice } from "@/components/layout/site-notice";
import { AppProviders } from "@/components/providers/app-providers";
import { PROJECT } from "@/lib/constants/project";

export const dynamic = "force-dynamic";

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(PROJECT.website),
  title: {
    default: "Green Tree | GTREE",
    template: "%s | Green Tree",
  },
  description:
    "Green Tree connects an open Solana digital market, transparent treasury records, community participation and evidence-based environmental missions.",
  keywords: [
    "Green Tree",
    "GTREE",
    "Solana",
    "Web3",
    "environmental missions",
    "transparency",
  ],
  openGraph: {
    title: "Green Tree | GTREE",
    description:
      "An open Solana market, transparent treasury and evidence-based environmental missions.",
    url: PROJECT.website,
    siteName: "Green Tree",
    images: ["/logo.png"],
  },
  twitter: { card: "summary", title: "Green Tree | GTREE", description: "An open Solana market, transparent treasury and evidence-based environmental missions." },
  icons: { icon: [{ url: "/icon.png", type: "image/png" }], apple: [{ url: "/apple-icon.png", type: "image/png" }] },
  manifest: "/site.webmanifest",
};

export const viewport: Viewport = { themeColor: "#20B2AA", colorScheme: "dark" };

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${sora.variable} ${dmSans.variable} ${geistMono.variable} h-full antialiased dark`}
    >
      <body className="min-h-full flex flex-col bg-gt-charcoal text-gt-fg">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:rounded-md focus:bg-gt-emerald focus:px-4 focus:py-2 focus:text-gt-black focus:font-semibold"
        >
          Skip to content
        </a>
        <AppProviders>
          <SiteHeader />
          <SiteNotice />
          <main id="main-content" className="flex-1">
            {children}
          </main>
          <SiteFooter />
        </AppProviders>
      </body>
    </html>
  );
}
