import type { MetadataRoute } from "next";
import { getNewsRepository } from "@/lib/news/repository";

const SITE_URL = "https://gtree.land";

const PUBLIC_PAGES: MetadataRoute.Sitemap = [
  { url: SITE_URL, changeFrequency: "daily", priority: 1 },
  { url: `${SITE_URL}/market`, changeFrequency: "daily", priority: 0.9 },
  { url: `${SITE_URL}/transparency`, changeFrequency: "weekly", priority: 0.7 },
  { url: `${SITE_URL}/missions`, changeFrequency: "weekly", priority: 0.7 },
  { url: `${SITE_URL}/ecosystem`, changeFrequency: "monthly", priority: 0.6 },
  { url: `${SITE_URL}/roadmap`, changeFrequency: "monthly", priority: 0.6 },
  { url: `${SITE_URL}/news`, changeFrequency: "daily", priority: 0.8 },
  { url: `${SITE_URL}/docs`, changeFrequency: "monthly", priority: 0.6 },
  { url: `${SITE_URL}/contact`, changeFrequency: "monthly", priority: 0.4 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const repository = getNewsRepository();
  const articles = repository.listPublishedForSitemap();

  return [
    ...PUBLIC_PAGES,
    ...articles.map((article) => ({
      url: `${SITE_URL}/news/${article.slug}`,
      lastModified: new Date(article.updatedAt),
      changeFrequency: "weekly" as const,
      priority: article.featured ? 0.8 : 0.6,
    })),
  ];
}
