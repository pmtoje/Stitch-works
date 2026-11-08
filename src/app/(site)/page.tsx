import Link from "next/link";
import { db } from "@/lib/db";
import { getContent, resolveStats } from "@/lib/cms";
import { ImageSlot } from "@/components/ui/image-slot";
import { Eyebrow, LinkButton, SectionHeading } from "@/components/ui";
import { naira } from "@/lib/format";
import { appUrl } from "@/lib/app-url";

export const dynamic = "force-dynamic";

const SERVICES = [
  { n: "01", slot: "service-workspace", title: "Workspace & Machine Rental", body: "Reserve fully equipped workstations and industrial machines by the hour, half day, full day or for consecutive days — individually or as a production line.", href: "/book", cta: "Reserve equipment", brief: "Row of industrial straight-stitch machines, morning light" },
  { n: "02", slot: "service-bulk", title: "Bulk Garment Production", body: "Uniforms, corporate wear and branded garments manufactured at scale, with quotations, deposits, milestone tracking and quality control built in.", href: "/bulk-production", cta: "Request a quote", brief: "Stacks of finished, folded uniforms ready for packing" },
  { n: "03", slot: "service-membership", title: "Tailor Membership", body: "Member rates on equipment, priority access to the floor and eligibility for paid production contracts across the network.", href: "/memberships", cta: "View plans", brief: "Tailor at a workstation measuring fabric" },
  { n: "04", slot: "service-partnerships", title: "Production Partnerships", body: "Brands, schools and institutions partner with StitchWorks for dependable, repeatable production runs and long-term supply.", href: "/contact?category=PARTNERSHIP", cta: "Partner with us", brief: "Production coordinator reviewing a tech pack with a client" },
  { n: "05", slot: "service-skills", title: "Skills Development", body: "Practical upskilling for working tailors: industrial machine operation, finishing standards and production discipline.", href: "/academy", cta: "Upskill", brief: "Instructor demonstrating an overlock seam" },
  { n: "06", slot: "service-academy", title: "StitchWorks Academy", body: "Structured, certified programmes from first stitch to production management — taught on real industrial equipment.", href: "/academy", cta: "Explore programmes", brief: "Students drafting patterns at a cutting table" },
];

const SECTORS = ["Schools", "Corporate organisations", "Government institutions", "NGOs", "Hospitality businesses", "Security companies", "Fashion brands", "Event organisers"];

const TAILOR_BENEFITS = [
  "Access to professional industrial equipment",
  "Affordable, flexible production workspace",
  "Access to paid garment production contracts",
  "Opportunities to work on bulk orders",
  "A professional network of fellow artisans",
  "Business development opportunities",
  "Continuous skills improvement",
];

const WHY = [
  ["Professional production infrastructure", "Industrial machines, cutting tables and pressing equipment, maintained on a preventive schedule and booked through a live inventory."],
  ["A skilled, verified artisan network", "Every StitchWorks tailor is assessed on practical skill before joining, with a traceable production history."],
  ["Quality assurance at every stage", "Each batch passes recorded inspection — accepted, rework and rejected quantities with named QC officers."],
  ["Flexible workspace access", "From a two-hour session on an overlocker to a week-long reservation of a full production line."],
  ["Scalable production capacity", "Orders are split across individual tailors and teams so capacity grows with the size of the contract."],
  ["Training and professional development", "StitchWorks Academy feeds new talent into the network and raises standards for everyone in it."],
];

export default async function HomePage() {
  const [hero, intro, stats, testimonials, courses, rates] = await Promise.all([
    getContent("home.hero"),
    getContent("home.intro"),
    resolveStats(),
    db.testimonial.findMany({ where: { published: true }, orderBy: { sortOrder: "asc" }, take: 3 }),
    db.course.findMany({ where: { published: true }, orderBy: { sortOrder: "asc" }, take: 8, select: { slug: true, title: true, durationWeeks: true, level: true } }),
    db.rateCard.findMany({ include: { category: true }, orderBy: { category: { sortOrder: "asc" } }, take: 4 }),
  ]);
  const headline = hero.headline.split(" ");
  const lastTwo = headline.splice(-2).join(" ");

  return (
    <>
      {/* HERO */}
      <section className="relative isolate overflow-hidden bg-charcoal-900">
        <div className="absolute inset-0 -z-10">
          <ImageSlot slot="home-hero" brief="Wide shot of the production floor: tailors at industrial machines, fabric bolts, natural light" tone="charcoal" priority />
          <div className="absolute inset-0 bg-gradient-to-r from-charcoal-900/95 via-charcoal-900/75 to-charcoal-900/20" />
        </div>
        <div className="container grid min-h-[78vh] items-end gap-10 pb-14 pt-24 md:pb-20 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <Eyebrow light>{hero.eyebrow}</Eyebrow>
            <h1 className="mt-6 text-[2.75rem] leading-[1.02] text-cream-50 sm:text-6xl lg:text-[5.5rem]">
              {headline.join(" ")} <em className="font-normal italic text-ochre-300">{lastTwo}</em>
            </h1>
            <p className="mt-7 max-w-xl text-lg leading-relaxed text-cream-200/85">{hero.sub}</p>
            <div className="mt-9 flex flex-wrap gap-3">
              <LinkButton href="/book" variant="gold" size="lg" arrow>Book a Workspace</LinkButton>
              <LinkButton href="/bulk-production" variant="light" size="lg" className="bg-transparent text-cream-50 hover:bg-cream-50/10 border-cream-50/40">Explore Bulk Production</LinkButton>
            </div>
          </div>
          <div className="hidden border-l border-cream-50/15 pl-8 lg:block">
            <p className="eyebrow-light">Three divisions · one platform</p>
            <ul className="mt-5 space-y-5">
              {[
                ["StitchWorks Production", "Workspace, machine rental, bulk manufacturing and contracts."],
                ["StitchWorks Academy", "Training, assessment and verifiable certification."],
                ["StitchWorks Marketplace", "Production jobs, artisan connections and partnerships."],
              ].map(([t, d]) => (
                <li key={t}>
                  <p className="font-display text-xl text-cream-50">{t}</p>
                  <p className="mt-1 text-sm text-cream-200/70">{d}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* A. INTRO */}
      <section className="border-b border-charcoal-900/10">
        <div className="container grid gap-12 py-20 md:py-28 lg:grid-cols-[1fr_1.1fr]">
          <SectionHeading index="01" eyebrow="The Common Facility Centre" title={intro.title} />
          <div>
            <p className="text-lg leading-relaxed text-charcoal-700 md:text-xl">{intro.body}</p>
            <div className="mt-10 grid grid-cols-2 gap-px border border-charcoal-900/10 bg-charcoal-900/10 sm:grid-cols-4">
              {["Workspace", "Machinery", "Skilled people", "Production work"].map((x, i) => (
                <div key={x} className="bg-cream-50 p-4">
                  <span className="font-mono text-xs text-ochre-600">0{i + 1}</span>
                  <p className="mt-6 text-sm font-medium text-charcoal-900">{x}</p>
                </div>
              ))}
            </div>
            <Link href="/about" className="link mt-8 inline-block font-medium">How the StitchWorks model works</Link>
          </div>
        </div>
      </section>

      {/* B. WHAT WE DO */}
      <section className="py-20 md:py-28">
        <div className="container">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <SectionHeading index="02" eyebrow="What we do" title="Six ways into garment production." />
            <LinkButton href="/services" variant="secondary" arrow>All services</LinkButton>
          </div>
          <div className="mt-14 grid gap-x-6 gap-y-14 md:grid-cols-2 lg:grid-cols-3">
            {SERVICES.map((s) => (
              <article key={s.n} className="group">
                <div className="aspect-[4/3] overflow-hidden">
                  <ImageSlot slot={s.slot} brief={s.brief} tone={Number(s.n) % 2 ? "forest" : "charcoal"} className="transition-transform duration-700 group-hover:scale-[1.03]" />
                </div>
                <div className="mt-5 flex gap-4">
                  <span className="font-mono text-xs text-ochre-600">{s.n}</span>
                  <div>
                    <h3 className="text-2xl text-charcoal-900">{s.title}</h3>
                    <p className="mt-2 text-[15px] leading-relaxed text-charcoal-600">{s.body}</p>
                    <Link href={s.href} className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-forest-700 hover:gap-3 transition-all">{s.cta} <span aria-hidden>→</span></Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* C. BOOK YOUR WORKSPACE */}
      <section className="bg-forest-800 text-cream-50">
        <div className="container grid gap-12 py-20 md:py-28 lg:grid-cols-2 lg:items-center">
          <div>
            <SectionHeading light index="03" eyebrow="Book your workspace" title="Two machines for tomorrow? Reserve them in a minute." intro="Choose a facility, a date and how long you need. See live availability for every workstation and machine, pick everything you need in one reservation, and confirm with secure online payment." />
            <ol className="mt-10 grid gap-4 sm:grid-cols-3">
              {["Pick date & duration", "Select machines", "Pay & confirm"].map((s, i) => (
                <li key={s} className="border-t border-cream-50/20 pt-4">
                  <span className="font-mono text-xs text-ochre-300">Step {i + 1}</span>
                  <p className="mt-1 font-medium">{s}</p>
                </li>
              ))}
            </ol>
            <div className="mt-10"><LinkButton href="/book" variant="gold" size="lg" arrow>Reserve a Workspace</LinkButton></div>
          </div>
          <div className="border border-cream-50/15 bg-forest-900/60 p-6">
            <p className="eyebrow-light">Current rates</p>
            {rates.length ? (
              <ul className="mt-4 divide-y divide-cream-50/10">
                {rates.map((r) => (
                  <li key={r.id} className="flex items-baseline justify-between gap-4 py-3">
                    <span className="text-cream-100">{r.category.name}</span>
                    <span className="text-right font-mono text-sm text-cream-200/80">
                      {naira(r.hourlyRate)}/hr · <span className="text-ochre-300">{naira(r.fullDayRate)}/day</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-cream-200/70">Rates are published by facility management. Check live pricing in the booking engine.</p>
            )}
            <p className="mt-4 text-xs text-cream-200/60">Member discounts apply automatically at checkout.</p>
          </div>
        </div>
      </section>

      {/* D. BULK PRODUCTION */}
      <section className="py-20 md:py-28">
        <div className="container grid gap-12 lg:grid-cols-[1fr_1.2fr]">
          <div className="order-2 aspect-[4/5] lg:order-1">
            <ImageSlot slot="home-bulk" brief="Production team inspecting a batch of school uniforms on a long table" tone="charcoal" />
          </div>
          <div className="order-1 lg:order-2 lg:pl-8">
            <SectionHeading index="04" eyebrow="Bulk production" title="From concept to completion, at the scale you need." intro="Submit your designs, quantities and deadlines. We return a transparent quotation, then manage cutting, sewing, inspection, finishing and dispatch — and you follow every stage online." />
            <ul className="mt-10 grid grid-cols-2 gap-px border border-charcoal-900/10 bg-charcoal-900/10">
              {SECTORS.map((s) => (
                <li key={s} className="bg-cream-50 px-4 py-3.5 text-[15px] text-charcoal-800">{s}</li>
              ))}
            </ul>
            <div className="mt-10 flex flex-wrap gap-3">
              <LinkButton href="/bulk-production#request" size="lg" arrow>Request a Production Quote</LinkButton>
              <LinkButton href="/bulk-production" variant="secondary" size="lg">How it works</LinkButton>
            </div>
          </div>
        </div>
      </section>

      {/* E. JOIN NETWORK */}
      <section className="border-y border-charcoal-900/10 bg-cream-100">
        <div className="container grid gap-12 py-20 md:py-28 lg:grid-cols-2">
          <div>
            <SectionHeading index="05" eyebrow="Join our network of tailors" title={<>Your craft deserves <em className="italic text-forest-700">better infrastructure.</em></>} intro="StitchWorks tailors work on professional equipment, earn from production contracts and grow alongside a network of serious artisans." />
            <div className="mt-10"><LinkButton href="/tailors" size="lg" arrow>Become a StitchWorks Tailor</LinkButton></div>
          </div>
          <ul className="divide-y divide-charcoal-900/10 border-y border-charcoal-900/10">
            {TAILOR_BENEFITS.map((b, i) => (
              <li key={b} className="flex items-baseline gap-5 py-4">
                <span className="font-mono text-xs text-ochre-600">{String(i + 1).padStart(2, "0")}</span>
                <span className="text-lg text-charcoal-900">{b}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* F. ACADEMY */}
      <section className="bg-charcoal-900 text-cream-50">
        <div className="container py-20 md:py-28">
          <div className="grid gap-12 lg:grid-cols-[1fr_1fr]">
            <SectionHeading light index="06" eyebrow="StitchWorks Academy" title="Learn the craft. Master the skill. Build your future." intro="Practical, certified training on industrial equipment — taught by working professionals, inside a working production facility." />
            <div className="aspect-[16/10]"><ImageSlot slot="home-academy" brief="Academy class: students at machines with an instructor" tone="forest" /></div>
          </div>
          <ul className="mt-14 grid gap-px bg-cream-50/10 sm:grid-cols-2 lg:grid-cols-4">
            {(courses.length ? courses.map((c) => ({ t: c.title, s: `${c.level} · ${c.durationWeeks} weeks`, href: `/academy/${c.slug}` })) : ["Basic tailoring", "Advanced garment construction", "Pattern drafting", "Industrial machine operation", "Fashion design", "Garment finishing", "Production management", "Entrepreneurship"].map((t) => ({ t, s: "Programme", href: "/academy" }))).map((c) => (
              <li key={c.t} className="bg-charcoal-900">
                <Link href={c.href} className="group block h-full p-5 hover:bg-charcoal-800">
                  <p className="text-xs text-cream-200/60">{c.s}</p>
                  <p className="mt-3 font-display text-xl group-hover:text-ochre-300">{c.t}</p>
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-10"><LinkButton href="/academy" variant="gold" size="lg" arrow>Explore the Academy</LinkButton></div>
        </div>
      </section>

      {/* G. WHY */}
      <section className="py-20 md:py-28">
        <div className="container">
          <SectionHeading index="07" eyebrow="Why StitchWorks" title="Built like a manufacturer. Run like a collective." />
          <div className="mt-14 grid gap-px border border-charcoal-900/10 bg-charcoal-900/10 md:grid-cols-2 lg:grid-cols-3">
            {WHY.map(([t, d]) => (
              <div key={t} className="bg-cream-50 p-7">
                <div className="h-px w-10 bg-ochre-500" />
                <h3 className="mt-5 text-xl text-charcoal-900">{t}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-charcoal-600">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* H. IMPACT */}
      {stats.length ? (
        <section className="border-y border-charcoal-900/10 bg-forest-50">
          <div className="container py-16">
            <Eyebrow>08 · Impact, live from our records</Eyebrow>
            <dl className="mt-8 grid grid-cols-2 gap-8 md:grid-cols-5">
              {stats.map((s) => (
                <div key={s.key} className="border-l border-forest-700/20 pl-4">
                  <dd className="font-display text-4xl text-forest-800 tabular-nums md:text-5xl">{s.value == null ? "—" : `${s.value.toLocaleString()}${s.suffix ?? ""}`}</dd>
                  <dt className="mt-2 text-sm text-charcoal-600">{s.label}</dt>
                </div>
              ))}
            </dl>
            <p className="mt-6 text-xs text-stone-500">Figures are calculated from the StitchWorks platform or entered and verified by management.</p>
          </div>
        </section>
      ) : null}

      {/* I. TESTIMONIALS */}
      {testimonials.length ? (
        <section className="py-20 md:py-28">
          <div className="container">
            <SectionHeading index="09" eyebrow="In their words" title="Trusted by makers and clients." />
            <div className="mt-12 grid gap-10 md:grid-cols-3">
              {testimonials.map((t) => (
                <figure key={t.id} className="border-t-2 border-forest-700 pt-6">
                  <blockquote className="font-display text-xl leading-snug text-charcoal-900">“{t.quote}”</blockquote>
                  <figcaption className="mt-5 text-sm"><span className="font-semibold text-charcoal-900">{t.author}</span>{t.role ? <span className="text-stone-500"> · {t.role}</span> : null}</figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* J. FINAL CTA */}
      <section className="relative isolate overflow-hidden bg-forest-900 text-cream-50">
        <div className="absolute inset-0 -z-10 opacity-40"><ImageSlot slot="home-cta" brief="Close-up of a needle running a seam on dark fabric" tone="forest" /></div>
        <div className="container py-24 text-center md:py-32">
          <Eyebrow light>Start today</Eyebrow>
          <h2 className="mx-auto mt-5 max-w-3xl text-4xl leading-tight md:text-6xl">Let’s Make Something <em className="italic text-ochre-300">Exceptional.</em></h2>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <LinkButton href="/book" variant="gold" size="lg">Book a Workspace</LinkButton>
            <LinkButton href="/bulk-production#request" variant="light" size="lg">Start a Production Order</LinkButton>
            <LinkButton href="/tailors" variant="light" size="lg" className="bg-transparent text-cream-50 border-cream-50/40 hover:bg-cream-50/10">Join StitchWorks</LinkButton>
          </div>
        </div>
      </section>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "LocalBusiness",
            name: "StitchWorks Collective",
            description: hero.sub,
            address: { "@type": "PostalAddress", addressLocality: "Jos", addressRegion: "Plateau", addressCountry: "NG" },
            url: appUrl(),
            makesOffer: ["Sewing machine rental", "Tailoring workspace rental", "Bulk uniform production", "Tailoring training"].map((n) => ({ "@type": "Offer", itemOffered: { "@type": "Service", name: n } })),
          }).replace(/</g, "\\u003c"),
        }}
      />
    </>
  );
}
