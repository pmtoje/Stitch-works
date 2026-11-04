import Link from "next/link";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { ImageSlot } from "@/components/ui/image-slot";
import { Alert, Checkbox, Eyebrow, Field, Input, LinkButton, SectionHeading, Select, Textarea } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { tailorApplicationAction } from "../public-actions";

export const metadata = { title: "Become a StitchWorks Tailor — Workspace, Equipment & Production Contracts", description: "Join the StitchWorks tailor network in Jos: shared industrial equipment, affordable workspace, paid piece-rate production contracts and professional growth." };

const STATES = ["Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa", "Benue", "Borno", "Cross River", "Delta", "Ebonyi", "Edo", "Ekiti", "Enugu", "FCT", "Gombe", "Imo", "Jigawa", "Kaduna", "Kano", "Katsina", "Kebbi", "Kogi", "Kwara", "Lagos", "Nasarawa", "Niger", "Ogun", "Ondo", "Osun", "Oyo", "Plateau", "Rivers", "Sokoto", "Taraba", "Yobe", "Zamfara"];
const SPECIALISATIONS = ["Shirts", "Trousers", "Uniforms", "Corporate wear", "Native wear", "Bridal", "Childrenswear", "Embroidery", "Pattern drafting", "Alterations"];
const MACHINES = ["Industrial straight-stitch", "Overlock", "Coverstitch", "Buttonhole", "Button-attaching", "Industrial cutting", "Embroidery", "Pressing"];
const INTERESTS = [["WORKSPACE_MEMBERSHIP", "Workspace membership"], ["MACHINE_RENTAL", "Machine rental"], ["PIECE_RATE", "Piece-rate production contracts"], ["FULL_TIME", "Full-time production opportunities"], ["PART_TIME", "Part-time opportunities"], ["INSTRUCTOR", "Academy instructor opportunities"]];

const BENEFITS = [
  ["Shared production infrastructure", "A professional floor with power, lighting and organisation you couldn’t justify alone."],
  ["Professional equipment", "Industrial machines maintained on schedule — book exactly what each job needs."],
  ["Production contracts", "Paid piece-rate work from StitchWorks bulk orders, allocated through the platform."],
  ["A professional artisan network", "Work alongside serious makers, share skills and form production teams."],
  ["Training & development", "Member access to clinics and Academy programmes to raise your standards."],
  ["Income & business growth", "Transparent earnings, verified track record and access to bigger clients."],
];

export default async function TailorsPage() {
  const [user, facilities] = await Promise.all([getCurrentUser(), db.facility.findMany({ where: { active: true }, select: { id: true, name: true } })]);
  return (
    <>
      <section className="grid lg:grid-cols-2">
        <div className="flex flex-col justify-center bg-forest-800 px-5 py-20 text-cream-50 md:px-16">
          <Eyebrow light>Become a StitchWorks Tailor</Eyebrow>
          <h1 className="mt-5 text-5xl leading-[1.04] md:text-7xl">Your Craft. Your Opportunity. <em className="italic text-ochre-300">Your Next Level.</em></h1>
          <p className="mt-6 max-w-lg text-lg text-cream-200/85">Join a network of verified professional tailors with access to industrial equipment, real production contracts and the support to grow your business.</p>
          <div className="mt-9 flex flex-wrap gap-3"><LinkButton href="#apply" variant="gold" size="lg" arrow>Apply to join</LinkButton><LinkButton href="/memberships" variant="light" size="lg" className="bg-transparent text-cream-50 border-cream-50/40 hover:bg-cream-50/10">Membership plans</LinkButton></div>
        </div>
        <div className="min-h-[420px]"><ImageSlot slot="tailors-hero" brief="Portrait of an experienced tailor at an industrial machine" tone="charcoal" priority /></div>
      </section>
      <section className="container py-20">
        <SectionHeading eyebrow="What you get" title="Everything a serious tailor needs to scale." />
        <div className="mt-12 grid gap-px border border-charcoal-900/10 bg-charcoal-900/10 md:grid-cols-3">
          {BENEFITS.map(([t, d]) => <div key={t} className="bg-cream-50 p-7"><div className="h-px w-10 bg-ochre-500" /><h3 className="mt-5 text-xl">{t}</h3><p className="mt-2 text-sm text-charcoal-600">{d}</p></div>)}
        </div>
      </section>
      <section id="marketplace" className="border-y border-charcoal-900/10 bg-cream-100">
        <div className="container grid gap-10 py-16 lg:grid-cols-2">
          <SectionHeading eyebrow="StitchWorks Production Marketplace" title="Apply for production jobs. Get paid for accepted work." />
          <ol className="space-y-4 text-charcoal-700">
            {["Approved tailors see open production jobs with quantities and piece rates.", "Apply for the quantity you can deliver — or receive direct allocations.", "Submit completed pieces for quality inspection on the platform.", "QC-accepted pieces become earnings, approved by the production manager and paid by finance — all visible in your dashboard."].map((s, i) => <li key={i} className="flex gap-4"><span className="font-mono text-xs text-ochre-600">0{i + 1}</span>{s}</li>)}
          </ol>
        </div>
      </section>
      <section id="apply" className="container scroll-mt-28 py-20">
        <div className="grid gap-12 lg:grid-cols-[1fr_2fr]">
          <div>
            <SectionHeading eyebrow="Application" title="Apply to the network." intro="Every applicant is reviewed, shortlisted and invited to a short practical assessment before approval." />
            <ol className="mt-6 space-y-1 text-sm text-stone-600">{["Submitted", "Under review", "Shortlisted", "Assessment scheduled", "Approved", "Onboarding", "Active"].map((s) => <li key={s}>— {s}</li>)}</ol>
          </div>
          {!user ? (
            <div className="border border-charcoal-900/10 bg-white p-8">
              <h3 className="text-2xl">Create an account to apply</h3>
              <p className="mt-2 text-charcoal-600">Your application, assessment schedule and future production work are all managed from your StitchWorks account.</p>
              <div className="mt-6 flex gap-3"><LinkButton href="/register?next=/tailors%23apply">Create account</LinkButton><LinkButton href="/login?next=/tailors%23apply" variant="secondary">Sign in</LinkButton></div>
            </div>
          ) : (
            <ActionForm action={tailorApplicationAction} className="space-y-10 border border-charcoal-900/10 bg-white p-6 md:p-8">
              <fieldset className="grid gap-4 sm:grid-cols-2">
                <legend className="mb-4 font-sans text-lg font-semibold">Personal information</legend>
                <Field label="Full name" required><Input name="fullName" defaultValue={user.fullName} required /></Field>
                <Field label="Phone number" required><Input name="phone" type="tel" defaultValue={user.phone ?? ""} required /></Field>
                <Field label="Email" required><Input name="email" type="email" defaultValue={user.email} required /></Field>
                <Field label="Date of birth" hint="Optional"><Input name="dateOfBirth" type="date" /></Field>
                <Field label="Residential address" required className="sm:col-span-2"><Input name="address" required /></Field>
                <Field label="State" required><Select name="state" defaultValue="Plateau">{STATES.map((s) => <option key={s}>{s}</option>)}</Select></Field>
                <Field label="Local Government Area" required><Input name="lga" required /></Field>
              </fieldset>
              <fieldset className="space-y-4">
                <legend className="mb-4 font-sans text-lg font-semibold">Professional information</legend>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Years of experience" required><Input name="yearsExperience" type="number" min={0} max={70} required /></Field>
                  <Field label="Preferred working arrangement" required><Select name="workingArrangement">{["Independent (own clients)", "Piece-rate contractor", "Full-time employee", "Part-time", "Flexible"].map((s) => <option key={s}>{s}</option>)}</Select></Field>
                </div>
                <div><p className="mb-2 text-sm font-medium">Specialisations</p><div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{SPECIALISATIONS.map((s) => <Checkbox key={s} name="specialisations" value={s} label={s} />)}</div></div>
                <Field label="Types of garments you produce" hint="Comma separated"><Input name="garmentTypes" placeholder="e.g. shirts, kaftans, school pinafores" /></Field>
                <div><p className="mb-2 text-sm font-medium">Machine competencies</p><div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{MACHINES.map((s) => <Checkbox key={s} name="machineSkills" value={s} label={s} />)}</div></div>
                <Field label="Previous work experience" required><Textarea name="previousWork" required /></Field>
                {facilities.length > 1 ? <Field label="Preferred facility"><Select name="facilityId">{facilities.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</Select></Field> : <input type="hidden" name="facilityId" value={facilities[0]?.id ?? ""} />}
              </fieldset>
              <fieldset className="space-y-4">
                <legend className="mb-4 font-sans text-lg font-semibold">Work samples</legend>
                <Field label="Portfolio photos or videos of completed garments" required hint="Up to 10 files · JPG/PNG/WEBP (10 MB) or MP4/MOV (50 MB)"><Input type="file" name="portfolio" multiple accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime" required /></Field>
                <Field label="Certificates (optional)" hint="PDF or images"><Input type="file" name="certificates" multiple accept="image/*,application/pdf" /></Field>
                <Field label="Professional references (optional)"><Textarea name="references" rows={2} placeholder="Name, relationship, phone" /></Field>
              </fieldset>
              <fieldset>
                <legend className="mb-3 font-sans text-lg font-semibold">I’m interested in</legend>
                <div className="grid gap-2 sm:grid-cols-2">{INTERESTS.map(([v, l]) => <Checkbox key={v} name="interests" value={v} label={l} />)}</div>
              </fieldset>
              <div className="border-t border-charcoal-900/10 pt-6"><SubmitButton size="lg" pendingText="Uploading & submitting…">Submit application</SubmitButton></div>
            </ActionForm>
          )}
        </div>
        <div className="mt-10"><Alert tone="info">Already a StitchWorks tailor? <Link href="/dashboard/tailor" className="link">Go to your tailor dashboard</Link>.</Alert></div>
      </section>
    </>
  );
}
