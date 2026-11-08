import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { ImageSlot } from "@/components/ui/image-slot";
import { DL, Eyebrow, LinkButton } from "@/components/ui";
import { fmtDate, naira } from "@/lib/format";

export const dynamic = "force-dynamic";

async function load(slug: string) {
  return db.course.findFirst({ where: { slug, published: true }, include: { instructor: { include: { user: true } }, sessions: { where: { open: true }, orderBy: { startsOn: "asc" }, include: { _count: { select: { enrolments: true } } } } } });
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const c = await load((await params).slug);
  return c ? { title: `${c.title} — StitchWorks Academy`, description: c.summary } : {};
}

export default async function CoursePage({ params }: { params: Promise<{ slug: string }> }) {
  const c = await load((await params).slug);
  if (!c) notFound();
  const outline = c.outline as { title: string; topics: string[] }[];
  const now = new Date();
  return (
    <>
      <section className="border-b border-charcoal-900/10">
        <div className="container grid gap-10 py-16 lg:grid-cols-[1.3fr_1fr]">
          <div>
            <Eyebrow>StitchWorks Academy · {c.level}</Eyebrow>
            <h1 className="mt-4 text-5xl leading-tight md:text-6xl">{c.title}</h1>
            <p className="mt-5 text-lg text-charcoal-600">{c.description}</p>
            <div className="mt-8"><DL items={[["Duration", `${c.durationWeeks} weeks`], ["Format", c.format], ["Tuition", naira(c.fee)], ["Application fee", c.applicationFee ? naira(c.applicationFee) : "None"], ["Instructor", c.instructor?.user.fullName ?? "To be confirmed"], ["Certification", c.certification]]} /></div>
          </div>
          <div className="aspect-[4/3]">{c.imageUploadId ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={`/api/files/${c.imageUploadId}`} alt="" className="h-full w-full object-cover" /> : <ImageSlot slot={`course-${c.slug}`} brief={`${c.title} class in session`} />}</div>
        </div>
      </section>
      <section className="container grid gap-12 py-16 lg:grid-cols-3">
        <div><h2 className="text-2xl">Learning objectives</h2><ul className="mt-4 space-y-2 text-charcoal-700">{c.objectives.map((o) => <li key={o}>— {o}</li>)}</ul></div>
        <div><h2 className="text-2xl">Entry requirements</h2><ul className="mt-4 space-y-2 text-charcoal-700">{c.requirements.map((o) => <li key={o}>— {o}</li>)}</ul></div>
        <div><h2 className="text-2xl">Course outline</h2><ol className="mt-4 space-y-3">{outline.map((m, i) => <li key={i}><p className="font-medium">{m.title}</p><p className="text-sm text-stone-600">{m.topics.join(" · ")}</p></li>)}</ol></div>
      </section>
      <section className="border-t border-charcoal-900/10 bg-cream-100">
        <div className="container py-16">
          <h2 className="text-3xl">Available sessions</h2>
          {c.sessions.length ? (
            <ul className="mt-6 grid gap-4 md:grid-cols-2">
              {c.sessions.map((s) => {
                const left = s.capacity - s._count.enrolments;
                const closed = s.applicationDeadline < now || left <= 0;
                return (
                  <li key={s.id} className="border border-charcoal-900/10 bg-white p-6">
                    <p className="text-xl font-display">{s.name}</p>
                    <div className="mt-3"><DL items={[["Dates", `${fmtDate(s.startsOn)} – ${fmtDate(s.endsOn)}`], ["Schedule", s.schedule], ["Fee", naira(s.feeOverride ?? c.fee)], ["Apply by", fmtDate(s.applicationDeadline)], ["Places left", left > 0 ? `${left} of ${s.capacity}` : "Full"]]} /></div>
                    <div className="mt-5">{closed ? <p className="text-sm font-medium text-red-700">{left <= 0 ? "This session is full." : "Applications closed."}</p> : <LinkButton href={`/academy/apply/${s.id}`} arrow>Apply for this session</LinkButton>}</div>
                  </li>
                );
              })}
            </ul>
          ) : <p className="mt-4 text-charcoal-600">New sessions will be announced soon. <a href="/contact?category=ACADEMY" className="link">Register your interest</a>.</p>}
        </div>
      </section>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ "@context": "https://schema.org", "@type": "Course", name: c.title, description: c.summary, provider: { "@type": "Organization", name: "StitchWorks Academy" } }).replace(/</g, "\\u003c") }} />
    </>
  );
}
