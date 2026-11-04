import Link from "next/link";
import { db } from "@/lib/db";
import { Eyebrow } from "@/components/ui";
import { fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Journal — Garment Manufacturing, Skills & Fashion Entrepreneurship", description: "Articles on garment manufacturing in Nigeria, tailoring skills, fashion entrepreneurship and the StitchWorks Collective." };

export default async function BlogIndex() {
  const posts = await db.blogPost.findMany({ where: { published: true }, orderBy: { publishedAt: "desc" } });
  return (
    <section className="container py-20">
      <Eyebrow>The StitchWorks Journal</Eyebrow>
      <h1 className="mt-4 text-5xl">Notes from the production floor.</h1>
      <ul className="mt-12 divide-y divide-charcoal-900/10 border-y border-charcoal-900/10">
        {posts.map((p) => (
          <li key={p.id}><Link href={`/blog/${p.slug}`} className="group grid gap-2 py-8 md:grid-cols-[180px_1fr]"><p className="text-sm text-stone-500">{fmtDate(p.publishedAt)}<br /><span className="eyebrow">{p.category}</span></p><div><h2 className="text-3xl group-hover:text-forest-700">{p.title}</h2><p className="mt-2 text-charcoal-600">{p.excerpt}</p></div></Link></li>
        ))}
      </ul>
      {!posts.length ? <p className="mt-6 text-charcoal-600">Articles coming soon.</p> : null}
    </section>
  );
}
