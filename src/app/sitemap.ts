import type { MetadataRoute } from "next";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.APP_URL ?? "http://localhost:3000";
  const statics = ["", "/about", "/services", "/book", "/bulk-production", "/tailors", "/academy", "/memberships", "/contact", "/faq", "/blog", "/verify"];
  const [courses, posts, policies] = await Promise.all([
    db.course.findMany({ where: { published: true }, select: { slug: true, updatedAt: true } }),
    db.blogPost.findMany({ where: { published: true }, select: { slug: true, updatedAt: true } }),
    db.policy.findMany({ select: { slug: true, updatedAt: true } }),
  ]);
  return [
    ...statics.map((p) => ({ url: `${base}${p}`, changeFrequency: "weekly" as const, priority: p === "" ? 1 : 0.8 })),
    ...courses.map((c) => ({ url: `${base}/academy/${c.slug}`, lastModified: c.updatedAt, priority: 0.7 })),
    ...posts.map((p) => ({ url: `${base}/blog/${p.slug}`, lastModified: p.updatedAt, priority: 0.6 })),
    ...policies.map((p) => ({ url: `${base}/policies/${p.slug}`, lastModified: p.updatedAt, priority: 0.3 })),
  ];
}
