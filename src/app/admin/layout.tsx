import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Administration",
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    nosnippet: true,
  },
};

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
