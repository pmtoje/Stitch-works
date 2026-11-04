import { ImageSlot } from "@/components/ui/image-slot";
import { Eyebrow, LinkButton, SectionHeading } from "@/components/ui";

export const metadata = { title: "About Us", description: "StitchWorks Collective operates a Common Facility Centre model for garment production in Jos, Nigeria — connecting tailors, equipment, clients and training." };

const ROLES = [
  ["Facility manager", "Runs daily operations: bookings, equipment, maintenance and the production floor."],
  ["Professional tailors", "Verified members who use the facility for their own work and for StitchWorks contracts."],
  ["Production coordinators", "Plan bulk orders, allocate work to tailors and teams, and manage deadlines."],
  ["Quality-control officers", "Inspect every batch and record accepted, rework and rejected pieces."],
  ["Academy instructors", "Teach practical programmes on the same equipment used in production."],
  ["Clients & partners", "Schools, companies, institutions and brands who commission garments."],
];

export default function AboutPage() {
  return (
    <>
      <section className="container grid gap-12 py-20 lg:grid-cols-2 lg:items-end">
        <div>
          <Eyebrow>About StitchWorks Collective</Eyebrow>
          <h1 className="mt-4 text-5xl leading-[1.05] md:text-7xl">A production ecosystem, not a tailoring shop.</h1>
        </div>
        <p className="text-lg leading-relaxed text-charcoal-600">StitchWorks Collective brings together the four things garment production needs — workspace, machinery, skilled people and a steady flow of work — in one professionally managed Common Facility Centre. We began in Jos, Plateau State, and are building the foundation for a national network of production centres.</p>
      </section>
      <div className="container"><div className="aspect-[21/9]"><ImageSlot slot="about-wide" brief="The Jos Common Facility Centre floor, wide angle" tone="charcoal" /></div></div>
      <section className="container grid gap-12 py-20 lg:grid-cols-2">
        <SectionHeading eyebrow="The Common Facility Centre model" title="Shared infrastructure. Individual opportunity." />
        <div className="space-y-5 text-lg leading-relaxed text-charcoal-700">
          <p>Industrial equipment is expensive and most tailors work alone. A Common Facility Centre solves both problems: the facility owns and maintains the machines, and professionals rent exactly the capacity they need — by the hour, day or week.</p>
          <p>Because many skilled tailors work under one roof, StitchWorks can also take on contracts no individual could: thousands of uniforms, split across verified tailors and teams, inspected and paid by the piece.</p>
          <p>And because training happens inside a working facility, StitchWorks Academy graduates step straight onto real production equipment.</p>
        </div>
      </section>
      <section className="border-y border-charcoal-900/10 bg-cream-100">
        <div className="container py-20">
          <SectionHeading eyebrow="How the facility runs" title="The people behind every garment." />
          <div className="mt-12 grid gap-px border border-charcoal-900/10 bg-charcoal-900/10 md:grid-cols-3">
            {ROLES.map(([t, d]) => <div key={t} className="bg-cream-50 p-7"><h3 className="text-xl">{t}</h3><p className="mt-2 text-sm text-charcoal-600">{d}</p></div>)}
          </div>
        </div>
      </section>
      <section className="container grid gap-8 py-20 md:grid-cols-3">
        {[["StitchWorks Production", "Workspace, machine rental, bulk manufacturing, tailor network and contracts.", "/services"], ["StitchWorks Academy", "Training, vocational education, assessments and certification.", "/academy"], ["StitchWorks Marketplace", "Production jobs, artisan connections, customer orders and partnerships.", "/tailors#marketplace"]].map(([t, d, h]) => (
          <div key={t} className="border-t-2 border-forest-700 pt-6"><h2 className="text-2xl">{t}</h2><p className="mt-2 text-charcoal-600">{d}</p><LinkButton href={h} variant="ghost" className="mt-4 px-0" arrow>Learn more</LinkButton></div>
        ))}
      </section>
    </>
  );
}
