import { db } from "@/lib/db";
import { ImageSlot } from "@/components/ui/image-slot";
import { Eyebrow, LinkButton, Table, Td } from "@/components/ui";
import { naira } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Our Services — Machine Rental, Workspace, Bulk Production & Training", description: "Sewing machine rental, tailoring workspace rental, bulk uniform production, tailor membership, production partnerships and training at StitchWorks Collective, Jos." };

export default async function ServicesPage() {
  const [cards, workstations] = await Promise.all([
    db.rateCard.findMany({ include: { category: true, facility: true }, orderBy: [{ facility: { name: "asc" } }, { category: { sortOrder: "asc" } }] }),
    db.workstation.findFirst({ where: { active: true } }),
  ]);
  const blocks = [
    { id: "machines", slot: "services-machines", t: "Workspace & machine rental", d: "Book workstations and industrial machines by the hour, half day, full day or for consecutive days. Combine several machines into one reservation and pay securely online.", href: "/book", cta: "Book now" },
    { id: "bulk", slot: "services-bulk", t: "Bulk garment production", d: "Uniforms, corporate wear and branded garments produced at scale with costed quotations, deposits, production tracking and recorded quality control.", href: "/bulk-production", cta: "Request a quote" },
    { id: "membership", slot: "services-membership", t: "Tailor membership", d: "Monthly plans with member equipment rates, priority booking and eligibility for paid production work.", href: "/memberships", cta: "Compare plans" },
    { id: "partnerships", slot: "services-partnerships", t: "Production partnerships", d: "Long-term supply arrangements for brands, schools and institutions with dedicated capacity planning.", href: "/contact?category=PARTNERSHIP", cta: "Talk to us" },
    { id: "academy", slot: "services-academy", t: "Skills development & Academy", d: "Certified programmes and short upskilling clinics on industrial equipment.", href: "/academy", cta: "View programmes" },
  ];
  return (
    <>
      <section className="container py-20"><Eyebrow>Our services</Eyebrow><h1 className="mt-4 max-w-4xl text-5xl leading-[1.05] md:text-7xl">Everything between a design and a delivered garment.</h1></section>
      {blocks.map((b, i) => (
        <section key={b.id} id={b.id} className="scroll-mt-24 border-t border-charcoal-900/10">
          <div className="container grid gap-10 py-14 md:grid-cols-2 md:items-center">
            <div className={`aspect-[16/10] ${i % 2 ? "md:order-2" : ""}`}><ImageSlot slot={b.slot} brief={b.t} tone={i % 2 ? "charcoal" : "forest"} /></div>
            <div><span className="font-mono text-xs text-ochre-600">0{i + 1}</span><h2 className="mt-3 text-4xl">{b.t}</h2><p className="mt-4 text-lg text-charcoal-600">{b.d}</p><LinkButton href={b.href} className="mt-6" arrow>{b.cta}</LinkButton></div>
          </div>
        </section>
      ))}
      <section className="border-t border-charcoal-900/10 bg-cream-100">
        <div className="container py-16">
          <h2 className="text-3xl">Equipment rental rates</h2>
          <p className="mt-2 text-charcoal-600">Published by facility management. Member discounts are applied automatically when you book.</p>
          <div className="mt-6">
            <Table head={["Facility", "Equipment", "Hourly", "Half day", "Full day", "Per day (2+ days)", "Security deposit"]} empty="Rates will be published soon.">
              {workstations ? <tr><Td>—</Td><Td>Workstation</Td><Td>{naira(workstations.hourlyRate)}</Td><Td>{naira(workstations.halfDayRate)}</Td><Td>{naira(workstations.fullDayRate)}</Td><Td>{naira(workstations.multiDayRate)}</Td><Td>—</Td></tr> : null}
              {cards.map((c) => <tr key={c.id}><Td>{c.facility.name}</Td><Td>{c.category.name}</Td><Td>{naira(c.hourlyRate)}</Td><Td>{naira(c.halfDayRate)}</Td><Td>{naira(c.fullDayRate)}</Td><Td>{naira(c.multiDayRate)}</Td><Td>{c.securityDeposit ? naira(c.securityDeposit) : "—"}</Td></tr>)}
            </Table>
          </div>
        </div>
      </section>
    </>
  );
}
