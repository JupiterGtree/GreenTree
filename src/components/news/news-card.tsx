import Link from "next/link";
import type { NewsPost } from "@/lib/news/repository";

export function NewsCard({ post }: { post: NewsPost }) {
  const date = post.publishedAt ?? post.scheduledAt ?? post.createdAt;
  return (
    <article className="surface-card overflow-hidden rounded-lg">
      {post.coverImage && (
        <img src={post.coverImage} alt="" className="aspect-[16/9] w-full object-cover" loading="lazy" />
      )}
      <div className="p-5">
        <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.12em] text-gt-muted">
          {post.category && <span className="text-gt-emerald-bright">{post.category}</span>}
          <time dateTime={new Date(date).toISOString()}>{formatDate(date)}</time>
        </div>
        <h2 className="mt-3 text-xl font-semibold text-gt-offwhite">
          <Link href={`/news/${post.slug}`} className="hover:text-gt-emerald-bright">
            {post.title}
          </Link>
        </h2>
        {post.excerpt && <p className="mt-3 line-clamp-3 leading-7 text-gt-muted">{post.excerpt}</p>}
        <Link href={`/news/${post.slug}`} className="mt-5 inline-block text-sm font-semibold text-gt-emerald-bright">
          Read update <span aria-hidden>→</span>
        </Link>
      </div>
    </article>
  );
}

export function formatDate(value: number): string {
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(value));
}
