import { db } from "@/lib/db";
import { Eyebrow, LinkButton } from "@/components/ui";
import { naira } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Membership Plans", description: "StitchWorks membership plans for tailors, production partners and students: member equipment rates, priority access and production job eligibility." };

export default async function MembershipsPage() {
  const plans = await db.membershipPlan.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } });
  return (
    <section className="container py-20">
      <Eyebrow>Membership</Eyebrow>
      <h1 className="mt-4 max-w-3xl text-5xl leading-tight md:text-6xl">Plans for every kind of maker.</h1>
      <div className="mt-14 grid gap-px border border-charcoal-900/10 bg-charcoal-900/10 md:grid-cols-2 xl:grid-cols-4">
        {plans.map((p, i) => (
          <article key={p.id} className={`flex flex-col p-7 ${i === 1 ? "bg-forest-800 text-cream-50" : "bg-cream-50"}`}>
            <p className={i === 1 ? "eyebrow-light" : "eyebrow"}>{p.audience.toLowerCase()}</p>
            <h2 className="mt-3 text-3xl">{p.name}</h2>
            <p className={`mt-2 text-sm ${i === 1 ? "text-cream-200/80" : "text-charcoal-600"}`}>{p.description}</p>
            <p className="mt-6 font-display text-4xl">{naira(p.fee)}<span className="font-sans text-sm opacity-70"> / {p.validityDays} days</span></p>
            <ul className="mt-6 flex-1 space-y-2 text-sm">
              {p.benefits.map((b) => <li key={b}>— {b}</li>)}
              <li>— Workspace: {p.workspaceAccess}</li>
              <li>— Machines: {p.machineAccess}</li>
              {p.bookingDiscountPct ? <li>— {p.bookingDiscountPct}% off equipment bookings</li> : null}
              {p.productionEligible ? <li>— Eligible for paid production jobs</li> : null}
            </ul>
            {p.renewalTerms ? <p className="mt-4 text-xs opacity-70">{p.renewalTerms}</p> : null}
            <LinkButton href="/dashboard/membership" variant={i === 1 ? "gold" : "primary"} className="mt-8">Choose {p.name}</LinkButton>
          </article>
        ))}
      </div>
      <p className="mt-6 text-sm text-stone-500">Tailor plans are available to approved StitchWorks tailors; other applicants are reviewed by the facility manager. <a className="link" href="/tailors">Apply to the network</a>.</p>
    </section>
  );
}
