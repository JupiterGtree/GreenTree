import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SafeMarkdown } from "@/components/news/safe-markdown";
import { formatDate } from "@/components/news/news-card";
import { PROJECT } from "@/lib/constants/project";
import { getNewsRepository } from "@/lib/news/repository";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getNewsRepository().findVisibleBySlug(slug);
  if (!post) return { title: "Update not found" };
  const description = post.seoDescription || post.excerpt || undefined;
  const image = post.ogImage || post.coverImage || "/logo.png";
  const canonical = `/news/${post.slug}`;
  return {
    title: post.seoTitle || post.title,
    description,
    alternates: { canonical },
    openGraph: {
      type: "article",
      title: post.ogTitle || post.seoTitle || post.title,
      description: post.ogDescription || description,
      url: canonical,
      images: [image],
      publishedTime: new Date(post.publishedAt ?? post.scheduledAt ?? post.createdAt).toISOString(),
      modifiedTime: new Date(post.updatedAt).toISOString(),
      tags: post.tags.map((tag) => tag.name),
    },
  };
}

export default async function NewsArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getNewsRepository().findVisibleBySlug(slug);
  if (!post) notFound();
  const published = post.publishedAt ?? post.scheduledAt ?? post.createdAt;
  const url = `${PROJECT.website}/news/${post.slug}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: post.title,
    description: post.excerpt || post.seoDescription || undefined,
    image: post.ogImage || post.coverImage || `${PROJECT.website}/logo.png`,
    datePublished: new Date(published).toISOString(),
    dateModified: new Date(post.updatedAt).toISOString(),
    mainEntityOfPage: url,
    author: { "@type": "Organization", name: "Green Tree" },
    publisher: {
      "@type": "Organization",
      name: "Green Tree",
      logo: { "@type": "ImageObject", url: `${PROJECT.website}/logo.png` },
    },
  };

  return (
    <article className="container-gt py-14 sm:py-20">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <div className="mx-auto max-w-4xl">
        <Link href="/news" className="text-sm font-semibold text-gt-emerald-bright">← All news</Link>
        <header className="mt-8 border-b border-gt-border pb-8">
          <div className="flex flex-wrap gap-3 text-xs uppercase tracking-[0.14em] text-gt-muted">
            {post.category && <span className="text-gt-emerald-bright">{post.category}</span>}
            <time dateTime={new Date(published).toISOString()}>{formatDate(published)}</time>
          </div>
          <h1 className="mt-4 text-balance font-display text-4xl font-semibold text-gt-offwhite sm:text-5xl">{post.title}</h1>
          {post.excerpt && <p className="mt-5 text-lg leading-8 text-gt-muted">{post.excerpt}</p>}
        </header>
        {post.coverImage && <img src={post.coverImage} alt="" className="mt-8 max-h-[34rem] w-full rounded-lg object-cover" />}
        <div className="mt-8"><SafeMarkdown source={post.body} /></div>
        {post.tags.length > 0 && (
          <footer className="mt-10 flex flex-wrap gap-2 border-t border-gt-border pt-6">
            {post.tags.map((tag) => (
              <Link key={tag.slug} href={`/news?tag=${encodeURIComponent(tag.slug)}`} className="rounded-full bg-gt-surface px-3 py-1 text-sm text-gt-muted">
                #{tag.name}
              </Link>
            ))}
          </footer>
        )}
      </div>
    </article>
  );
}
