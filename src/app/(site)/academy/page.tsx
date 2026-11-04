import Link from "next/link";
import { db } from "@/lib/db";
import { ImageSlot } from "@/components/ui/image-slot";
import { Eyebrow, LinkButton, SectionHeading } from "@/components/ui";
import { fmtDate, naira } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "StitchWorks Academy — Tailoring & Fashion Training in Jos", description: "Certified, practical tailoring, pattern drafting, industrial machine operation, fashion design and production management courses at StitchWorks Academy, Jos, Nigeria." };

export default async function AcademyPage() {
  const courses = await db.course.findMany({ where: { published: true }, orderBy: { sortOrder: "asc" }, include: { sessions: { where: { open: true, applicationDeadline: { gt: new Date() } }, orderBy: { startsOn: "asc" }, take: 1 } } });
  const levels = [...new Set(courses.map((c) => c.level))];
  return (
    <>
      <section className="bg-charcoal-900 text-cream-50">
        <div className="container grid gap-10 py-20 md:py-28 lg:grid-cols-[1.3fr_1fr] lg:items-end">
          <div>
            <Eyebrow light>StitchWorks Academy</Eyebrow>
            <h1 className="mt-5 text-5xl leading-[1.04] md:text-7xl">Learn the Craft. Master the Skill. <em className="italic text-ochre-300">Build Your Future.</em></h1>
            <p className="mt-6 max-w-xl text-lg text-cream-200/80">Vocational training delivered inside a working garment production facility — on industrial equipment, by practising professionals, with certificates anyone can verify.</p>
            <div className="mt-9 flex flex-wrap gap-3"><LinkButton href="#programmes" variant="gold" size="lg" arrow>View programmes</LinkButton><LinkButton href="/verify" variant="light" size="lg" className="bg-transparent text-cream-50 border-cream-50/40 hover:bg-cream-50/10">Verify a certificate</LinkButton></div>
          </div>
          <div className="aspect-[4/3]"><ImageSlot slot="academy-hero" brief="Instructor guiding a student through pattern cutting" tone="forest" priority /></div>
        </div>
      </section>
      <section id="programmes" className="container scroll-mt-24 py-20">
        <SectionHeading eyebrow="Programmes" title="From first stitch to production floor." />
        {levels.map((lvl) => (
          <div key={lvl} className="mt-12">
            <p className="eyebrow">{lvl}</p>
            <ul className="mt-4 divide-y divide-charcoal-900/10 border-y border-charcoal-900/10">
              {courses.filter((c) => c.level === lvl).map((c) => (
                <li key={c.id}>
                  <Link href={`/academy/${c.slug}`} className="group grid gap-2 py-6 md:grid-cols-[1.4fr_2fr_1fr_auto] md:items-center md:gap-6">
                    <h3 className="text-2xl group-hover:text-forest-700">{c.title}</h3>
                    <p className="text-sm text-charcoal-600">{c.summary}</p>
                    <p className="text-sm text-stone-600">{c.durationWeeks} weeks · {naira(c.fee)}<br /><span className="text-xs">{c.sessions[0] ? `Next: ${fmtDate(c.sessions[0].startsOn)}` : "Sessions to be announced"}</span></p>
                    <span aria-hidden className="text-2xl text-ochre-500 transition-transform group-hover:translate-x-1">→</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
      <section id="apply" className="border-t border-charcoal-900/10 bg-cream-100">
        <div className="container grid gap-10 py-16 md:grid-cols-4">
          {[["Choose a programme", "Compare duration, schedule, fees and entry requirements."], ["Apply online", "Takes a few minutes. Upload any documents requested."], ["Get accepted & pay", "Pay tuition securely online to confirm your place."], ["Train & certify", "Attend, complete assessments, receive a verifiable certificate."]].map(([t, d], i) => (
            <div key={t}><span className="font-mono text-xs text-ochre-600">0{i + 1}</span><h3 className="mt-3 text-xl">{t}</h3><p className="mt-1 text-sm text-charcoal-600">{d}</p></div>
          ))}
        </div>
      </section>
    </>
  );
}
