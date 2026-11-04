import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { Eyebrow } from "@/components/ui";
import { Markdown } from "@/components/ui/markdown";
import { fmtDate } from "@/lib/format";

const load = (slug: string) => db.blogPost.findFirst({ where: { slug, published: true } });

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const p = await load((await params).slug);
  return p ? { title: p.title, description: p.excerpt, openGraph: { type: "article", title: p.title, description: p.excerpt } } : {};
}

export default async function BlogPost({ params }: { params: Promise<{ slug: string }> }) {
  const p = await load((await params).slug);
  if (!p) notFound();
  return (
    <article className="container max-w-3xl py-20">
      <Eyebrow>{p.category}</Eyebrow>
      <h1 className="mt-4 text-4xl leading-tight md:text-5xl">{p.title}</h1>
      <p className="mt-4 text-sm text-stone-500">{p.authorName} · {fmtDate(p.publishedAt)}</p>
      <p className="mt-8 text-xl leading-relaxed text-charcoal-700">{p.excerpt}</p>
      <div className="mt-8"><Markdown text={p.body} /></div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ "@context": "https://schema.org", "@type": "Article", headline: p.title, datePublished: p.publishedAt, author: { "@type": "Organization", name: p.authorName } }).replace(/</g, "\\u003c") }} />
    </article>
  );
}
