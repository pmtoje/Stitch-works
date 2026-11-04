import { getCurrentUser } from "@/lib/auth/session";
import { ImageSlot } from "@/components/ui/image-slot";
import { Checkbox, Eyebrow, Field, Input, LinkButton, SectionHeading, Select, Textarea } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { bulkOrderAction } from "../public-actions";
import { GarmentRows } from "./garment-rows";

export const metadata = {
  title: "Bulk Garment & Uniform Production in Nigeria",
  description: "Bulk uniform and corporate garment manufacturing for schools, companies, government, NGOs, hospitality and security firms. Request a production quotation from StitchWorks Collective, Jos.",
};

const STEPS = [
  ["Submit your request", "Garments, quantities, sizes, branding, deadlines — plus designs, tech packs and logo files."],
  ["Receive a quotation", "Unit prices, materials, labour, finishing, logistics and timeline, itemised and transparent."],
  ["Confirm with a deposit", "Accept online, pay the deposit securely and your order is scheduled for production."],
  ["Track every stage", "Sourcing, cutting, sewing, quality control, finishing and dispatch — live in your portal."],
];
const ORG_TYPES = [["SCHOOL", "School"], ["CORPORATE", "Corporate organisation"], ["GOVERNMENT", "Government institution"], ["NGO", "NGO"], ["HOSPITALITY", "Hospitality business"], ["SECURITY", "Security company"], ["FASHION_BRAND", "Fashion brand"], ["EVENTS", "Event organiser"], ["HEALTHCARE", "Healthcare"], ["RELIGIOUS", "Religious organisation"], ["INDIVIDUAL", "Individual"], ["OTHER", "Other"]];

export default async function BulkProductionPage() {
  const user = await getCurrentUser();
  return (
    <>
      <section className="relative isolate overflow-hidden bg-charcoal-900 text-cream-50">
        <div className="absolute inset-0 -z-10 opacity-50"><ImageSlot slot="bulk-hero" brief="Production line of tailors sewing matching uniforms" tone="charcoal" priority /></div>
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-charcoal-900 via-charcoal-900/80 to-transparent" />
        <div className="container py-24 md:py-32">
          <Eyebrow light>StitchWorks Production · B2B</Eyebrow>
          <h1 className="mt-5 max-w-4xl text-5xl leading-[1.04] md:text-7xl">From Concept to Completion. <em className="italic text-ochre-300">We Make Production Happen.</em></h1>
          <p className="mt-6 max-w-2xl text-lg text-cream-200/85">StitchWorks accepts garment production contracts of different sizes — from a few dozen staff uniforms to thousands of school outfits — with costed quotations, recorded quality control and full order tracking.</p>
          <div className="mt-9 flex flex-wrap gap-3"><LinkButton href="#request" variant="gold" size="lg" arrow>Request a production quote</LinkButton><LinkButton href="/dashboard/orders" variant="light" size="lg" className="bg-transparent text-cream-50 border-cream-50/40 hover:bg-cream-50/10">Track an existing order</LinkButton></div>
        </div>
      </section>
      <section className="container py-20">
        <SectionHeading eyebrow="How it works" title="A production process you can see." />
        <ol className="mt-12 grid gap-px border border-charcoal-900/10 bg-charcoal-900/10 md:grid-cols-4">
          {STEPS.map(([t, d], i) => <li key={t} className="bg-cream-50 p-6"><span className="font-mono text-xs text-ochre-600">0{i + 1}</span><h3 className="mt-6 text-xl">{t}</h3><p className="mt-2 text-sm text-charcoal-600">{d}</p></li>)}
        </ol>
      </section>
      <section id="request" className="scroll-mt-28 border-t border-charcoal-900/10 bg-cream-100">
        <div className="container grid gap-12 py-20 lg:grid-cols-[1fr_2fr]">
          <div>
            <SectionHeading eyebrow="Production request" title="Tell us what you need made." intro="No fixed price is forced on complex work — we review every request and send a costed quotation, usually within two working days." />
            {!user ? <p className="mt-6 text-sm text-charcoal-600">Not registered? We’ll create a secure account from your email so you can review quotations and track production. Already have one? <a href="/login?next=/bulk-production%23request" className="link">Sign in first</a>.</p> : null}
          </div>
          <ActionForm action={bulkOrderAction} className="space-y-10 border border-charcoal-900/10 bg-white p-6 md:p-8">
            <fieldset className="grid gap-4 sm:grid-cols-2">
              <legend className="mb-4 font-sans text-lg font-semibold">1. Your organisation</legend>
              <Field label="Organisation / business name" required><Input name="orgName" required /></Field>
              <Field label="Organisation type" required><Select name="orgType" required defaultValue="">{[["", "Select…"], ...ORG_TYPES].map(([v, l]) => <option key={v} value={v} disabled={!v}>{l}</option>)}</Select></Field>
              <Field label="Contact person" required><Input name="contactName" defaultValue={user?.fullName ?? ""} required /></Field>
              <Field label="Email address" required><Input type="email" name="email" defaultValue={user?.email ?? ""} required /></Field>
              <Field label="Phone number" required><Input type="tel" name="phone" defaultValue={user?.phone ?? ""} required /></Field>
              <Field label="Organisation address" required><Input name="address" required /></Field>
            </fieldset>
            <fieldset className="space-y-4">
              <legend className="mb-4 font-sans text-lg font-semibold">2. The order</legend>
              <Field label="Garment types and estimated quantities" required><GarmentRows /></Field>
              <Field label="Description of the garments" required hint="Style, fit, fabric weight, any reference to existing uniforms."><Textarea name="description" required /></Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Number of different designs"><Input type="number" name="designsCount" min={1} defaultValue={1} /></Field>
                <Field label="Sizes required" required hint="e.g. S–XXL, or ages 5–16"><Input name="sizes" required /></Field>
                <Field label="Fabric requirements"><Input name="fabricRequirements" placeholder="e.g. 65/35 poly-cotton, 180gsm" /></Field>
                <Field label="Preferred colours"><Input name="colours" /></Field>
                <Field label="Branding requirements"><Input name="branding" placeholder="Labels, logos, name tags" /></Field>
                <Field label="Embroidery"><Input name="embroidery" placeholder="e.g. left-chest crest, 8cm" /></Field>
                <Field label="Printing"><Input name="printing" placeholder="e.g. screen print on back" /></Field>
                <Field label="Required delivery date"><Input type="date" name="requiredBy" /></Field>
                <Field label="Delivery location" required><Input name="deliveryLocation" required /></Field>
                <Field label="Expected budget (₦, optional)"><Input name="budget" inputMode="numeric" /></Field>
              </div>
              <fieldset>
                <legend className="mb-2 text-sm font-medium">Fabric</legend>
                <div className="flex flex-wrap gap-5 text-sm">
                  {[["STITCHWORKS", "StitchWorks to source fabric"], ["CUSTOMER", "We will provide fabric"], ["UNDECIDED", "Not sure yet"]].map(([v, l]) => <label key={v} className="flex items-center gap-2"><input type="radio" name="fabricSource" value={v} defaultChecked={v === "UNDECIDED"} className="accent-forest-700" />{l}</label>)}
                </div>
              </fieldset>
              <Field label="Additional instructions"><Textarea name="instructions" rows={3} /></Field>
            </fieldset>
            <fieldset>
              <legend className="mb-2 font-sans text-lg font-semibold">3. Supporting documents</legend>
              <Field label="Design references, photos, sketches, measurement charts, tech packs, logos" hint="Up to 10 files · JPG, PNG, WEBP, PDF, DOCX, XLSX · max 15 MB each"><Input type="file" name="files" multiple accept=".jpg,.jpeg,.png,.webp,.pdf,.docx,.xlsx" /></Field>
            </fieldset>
            <div className="flex flex-wrap items-center justify-between gap-4 border-t border-charcoal-900/10 pt-6">
              <Checkbox name="consent" required label="I agree to StitchWorks contacting me about this request." />
              <SubmitButton size="lg" pendingText="Submitting & uploading…">Submit production request</SubmitButton>
            </div>
          </ActionForm>
        </div>
      </section>
    </>
  );
}
