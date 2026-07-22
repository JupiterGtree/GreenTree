import type { Metadata } from "next";
import Link from "next/link";
import { NewsCard } from "@/components/news/news-card";
import { SectionHeading } from "@/components/shared/section-heading";
import { getNewsRepository } from "@/lib/news/repository";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "News & Updates",
  description: "Official Green Tree project news, releases, mission updates and public announcements.",
  alternates: { canonical: "/news" },
  openGraph: {
    title: "News & Updates — Green Tree",
    description: "Official Green Tree project news and public announcements.",
    url: "/news",
  },
};

export default async function NewsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; tag?: string }>;
}) {
  const filters = await searchParams;
  const repository = getNewsRepository();
  const posts = repository.listVisible({ category: filters.category, tag: filters.tag });
  const categories = repository.categories();

  return (
    <div className="container-gt py-16 sm:py-20">
      <SectionHeading
        eyebrow="News & Updates"
        title="What Green Tree is doing now."
        description="Official project releases, mission updates and public announcements, sourced directly from our publishing system."
      />
      {categories.length > 0 && (
        <nav aria-label="News categories" className="mt-8 flex flex-wrap gap-2">
          <Link href="/news" className="rounded-full border border-gt-border px-3 py-1.5 text-sm text-gt-muted">All</Link>
          {categories.map((category) => (
            <Link key={category.slug} href={`/news?category=${encodeURIComponent(category.slug)}`} className="rounded-full border border-gt-border px-3 py-1.5 text-sm text-gt-muted">
              {category.name}
            </Link>
          ))}
        </nav>
      )}
      {posts.length ? (
        <div className="mt-10 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {posts.map((post) => <NewsCard key={post.id} post={post} />)}
        </div>
      ) : (
        <p className="mt-12 rounded-lg border border-gt-border bg-gt-surface/50 p-8 text-center text-gt-muted">
          No published updates are available yet.
        </p>
      )}
    </div>
  );
}
