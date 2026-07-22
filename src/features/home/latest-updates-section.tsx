import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { NewsCard } from "@/components/news/news-card";
import { SectionHeading } from "@/components/shared/section-heading";
import { Button } from "@/components/ui/button";
import { getNewsRepository } from "@/lib/news/repository";
import { getSiteContent } from "@/lib/admin/site-content";

export function LatestUpdatesSection() {
  const repository = getNewsRepository();
  const selected = getSiteContent().featuredNewsIds;
  const posts = selected.length ? repository.visibleByIds(selected) : repository.latest(3);
  if (!posts.length) return null;
  return (
    <section className="border-t border-gt-border-soft bg-gt-charcoal py-20 sm:py-24">
      <div className="container-gt">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <SectionHeading eyebrow="Latest Updates" title="News from Green Tree." />
          <Button asChild variant="outline">
            <Link href="/news">All news <ArrowUpRight className="size-4" aria-hidden /></Link>
          </Button>
        </div>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {posts.map((post) => <NewsCard key={post.id} post={post} />)}
        </div>
      </div>
    </section>
  );
}
