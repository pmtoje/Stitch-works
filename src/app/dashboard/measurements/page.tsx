import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { Field, Input, PageHeader, Panel, Select, Textarea } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { fmtDate } from "@/lib/format";
import { deleteMeasurementsAction, saveMeasurementsAction } from "../actions";

const FIELDS = ["chest", "waist", "hips", "shoulder", "sleeve", "neck", "inseam", "outseam", "height", "thigh"];

function Form({ p }: { p?: { id: string; label: string; unit: string; values: Record<string, number>; notes: string | null } }) {
  return (
    <ActionForm action={saveMeasurementsAction} className="space-y-4" resetOnSuccess={!p}>
      {p ? <input type="hidden" name="id" value={p.id} /> : null}
      <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
        <Field label="Profile name"><Input name="label" defaultValue={p?.label ?? ""} placeholder="e.g. Me — kaftan fit" required /></Field>
        <Field label="Unit"><Select name="unit" defaultValue={p?.unit ?? "cm"}><option value="cm">cm</option><option value="in">inches</option></Select></Field>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {FIELDS.map((f) => <Field key={f} label={f[0].toUpperCase() + f.slice(1)}><Input name={f} inputMode="decimal" defaultValue={p?.values[f] ?? ""} /></Field>)}
      </div>
      <Field label="Notes / style preferences"><Textarea name="notes" rows={2} defaultValue={p?.notes ?? ""} /></Field>
      <SubmitButton>{p ? "Update" : "Save measurements"}</SubmitButton>
    </ActionForm>
  );
}

export default async function Measurements() {
  const u = await requireUser();
  const profiles = await db.measurementProfile.findMany({ where: { userId: u.id }, orderBy: { updatedAt: "desc" } });
  return (
    <>
      <PageHeader title="Measurements" description="Store measurement profiles for yourself or others. Attach them to individual garment orders when you contact us or submit a request." />
      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="New measurement profile"><Form /></Panel>
        {profiles.map((p) => (
          <Panel key={p.id} title={p.label} actions={<span className="text-xs text-stone-500">Updated {fmtDate(p.updatedAt)}</span>}>
            <Form p={{ ...p, values: p.values as Record<string, number> }} />
            <ActionForm action={deleteMeasurementsAction} className="mt-3" confirm="Delete this profile?"><input type="hidden" name="id" value={p.id} /><SubmitButton variant="ghost" size="sm">Delete</SubmitButton></ActionForm>
          </Panel>
        ))}
      </div>
    </>
  );
}
