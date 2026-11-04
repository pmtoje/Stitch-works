import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { Eyebrow, Field, Input, LinkButton, Textarea } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { fmtDate, naira } from "@/lib/format";
import { studentApplicationAction } from "../../../public-actions";

export const metadata = { title: "Apply — StitchWorks Academy", robots: { index: false } };

export default async function ApplyPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const s = await db.courseSession.findUnique({ where: { id: sessionId }, include: { course: true } });
  if (!s || !s.course.published) notFound();
  const user = await getCurrentUser();
  return (
    <section className="container max-w-3xl py-16">
      <Eyebrow>Academy application</Eyebrow>
      <h1 className="mt-3 text-4xl">{s.course.title}</h1>
      <p className="mt-2 text-charcoal-600">{s.name} · starts {fmtDate(s.startsOn)} · {s.schedule} · tuition {naira(s.feeOverride ?? s.course.fee)}{s.course.applicationFee ? ` · application fee ${naira(s.course.applicationFee)}` : ""}</p>
      {!user ? (
        <div className="mt-10 border border-charcoal-900/10 bg-white p-8">
          <p className="text-lg">Create a free account to apply — it takes under a minute, and you’ll use it to track your admission and access the student portal.</p>
          <div className="mt-6 flex gap-3"><LinkButton href={`/register?next=/academy/apply/${s.id}`}>Create account</LinkButton><LinkButton href={`/login?next=/academy/apply/${s.id}`} variant="secondary">Sign in</LinkButton></div>
        </div>
      ) : (
        <ActionForm action={studentApplicationAction} className="mt-10 space-y-5 border border-charcoal-900/10 bg-white p-6 md:p-8">
          <input type="hidden" name="sessionId" value={s.id} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name" required><Input name="fullName" defaultValue={user.fullName} required /></Field>
            <Field label="Phone" required><Input name="phone" type="tel" defaultValue={user.phone ?? ""} required /></Field>
            <Field label="Email" required><Input name="email" type="email" defaultValue={user.email} required /></Field>
            <Field label="Date of birth"><Input name="dateOfBirth" type="date" /></Field>
          </div>
          <Field label="Address" required><Input name="address" required /></Field>
          <Field label="Highest level of education" required><Input name="education" placeholder="e.g. SSCE, OND, BSc" required /></Field>
          <Field label="Sewing or fashion experience" required><Textarea name="experience" rows={2} placeholder="None is fine for foundation courses" required /></Field>
          <Field label="Why do you want to take this course?" required><Textarea name="motivation" rows={3} required /></Field>
          <Field label="Supporting documents (optional)" hint="ID, certificates — PDF or images, up to 5"><Input type="file" name="documents" multiple accept="image/*,application/pdf" /></Field>
          <SubmitButton size="lg" pendingText="Submitting…">Submit application</SubmitButton>
        </ActionForm>
      )}
    </section>
  );
}
