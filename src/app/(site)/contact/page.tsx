import { db } from "@/lib/db";
import { getContent } from "@/lib/cms";
import { Eyebrow, Field, Input, Select, Textarea } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { enquiryAction } from "../public-actions";

export const metadata = { title: "Contact Us", description: "Contact StitchWorks Collective in Jos for workspace bookings, bulk production, tailor registration, Academy admissions and partnerships." };

const CATS = [["GENERAL", "General enquiry"], ["WORKSPACE_BOOKING", "Workspace booking"], ["BULK_PRODUCTION", "Bulk production"], ["TAILOR_REGISTRATION", "Tailor registration"], ["ACADEMY", "Academy"], ["PARTNERSHIP", "Partnership"]];

export default async function ContactPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const [c, faqs] = await Promise.all([getContent("contact"), db.faq.findMany({ where: { published: true }, orderBy: { sortOrder: "asc" }, take: 6 })]);
  const wa = c.whatsapp.replace(/\D/g, "");
  return (
    <>
      <section className="container grid gap-12 py-20 lg:grid-cols-[1fr_1.3fr]">
        <div>
          <Eyebrow>Contact us</Eyebrow>
          <h1 className="mt-4 text-5xl leading-tight md:text-6xl">Let’s talk production.</h1>
          <dl className="mt-10 space-y-6">
            <div><dt className="eyebrow">Visit</dt><dd className="mt-1 text-lg">{c.address}</dd><dd className="text-sm text-stone-500">{c.hours}</dd></div>
            {c.phone ? <div><dt className="eyebrow">Call</dt><dd className="mt-1 text-lg"><a href={`tel:${c.phone.replace(/\s/g, "")}`} className="hover:text-forest-700">{c.phone}</a></dd></div> : null}
            {c.email ? <div><dt className="eyebrow">Email</dt><dd className="mt-1 text-lg"><a href={`mailto:${c.email}`} className="hover:text-forest-700">{c.email}</a></dd></div> : null}
            {wa ? <div><dt className="eyebrow">WhatsApp</dt><dd className="mt-1 text-lg"><a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" className="link">Chat with us on WhatsApp</a></dd></div> : null}
          </dl>
        </div>
        <ActionForm action={enquiryAction} resetOnSuccess className="space-y-4 border border-charcoal-900/10 bg-white p-6 md:p-8">
          <h2 className="font-sans text-lg font-semibold">Send an enquiry</h2>
          <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
          <Field label="What is it about?"><Select name="category" defaultValue={sp.category ?? "GENERAL"}>{CATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" required><Input name="name" required /></Field>
            <Field label="Email" required><Input type="email" name="email" required /></Field>
            <Field label="Phone"><Input type="tel" name="phone" /></Field>
            <Field label="Organisation"><Input name="company" /></Field>
          </div>
          <Field label="Message" required><Textarea name="message" rows={5} required /></Field>
          <SubmitButton>Send enquiry</SubmitButton>
        </ActionForm>
      </section>
      <section className="border-t border-charcoal-900/10">
        <iframe title="Map showing StitchWorks location" className="h-[360px] w-full grayscale" loading="lazy" referrerPolicy="no-referrer-when-downgrade" src={`https://www.google.com/maps?q=${encodeURIComponent(c.mapQuery)}&output=embed`} />
      </section>
      {faqs.length ? (
        <section className="container py-16">
          <h2 className="text-3xl">Customer support · FAQs</h2>
          <div className="mt-6 divide-y divide-charcoal-900/10 border-y border-charcoal-900/10">
            {faqs.map((f) => <details key={f.id} className="group py-4"><summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">{f.question}<span className="text-ochre-600 group-open:rotate-45 transition-transform">+</span></summary><p className="mt-3 text-charcoal-600">{f.answer}</p></details>)}
          </div>
          <a href="/faq" className="link mt-6 inline-block">All FAQs</a>
        </section>
      ) : null}
    </>
  );
}
