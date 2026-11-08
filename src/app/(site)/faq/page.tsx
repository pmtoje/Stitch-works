import { db } from "@/lib/db";
import { Eyebrow } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Frequently Asked Questions" };

export default async function FaqPage() {
  const faqs = await db.faq.findMany({ where: { published: true }, orderBy: [{ category: "asc" }, { sortOrder: "asc" }] });
  const cats = [...new Set(faqs.map((f) => f.category))];
  return (
    <section className="container max-w-4xl py-20">
      <Eyebrow>Help centre</Eyebrow>
      <h1 className="mt-4 text-5xl">Frequently asked questions</h1>
      {cats.map((c) => (
        <div key={c} className="mt-12">
          <h2 className="text-2xl">{c}</h2>
          <div className="mt-4 divide-y divide-charcoal-900/10 border-y border-charcoal-900/10">
            {faqs.filter((f) => f.category === c).map((f) => <details key={f.id} className="group py-4"><summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">{f.question}<span className="text-ochre-600 transition-transform group-open:rotate-45">+</span></summary><p className="mt-3 text-charcoal-600">{f.answer}</p></details>)}
          </div>
        </div>
      ))}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.question, acceptedAnswer: { "@type": "Answer", text: f.answer } })) }).replace(/</g, "\\u003c") }} />
    </section>
  );
}
