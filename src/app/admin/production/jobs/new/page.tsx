import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { Checkbox, Field, Input, PageHeader, Panel, Select, Textarea } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { jobAction } from "../../../actions";

export default async function NewJob() {
  await requirePermission("production.manage");
  const facilities = await db.facility.findMany();
  return (
    <>
      <PageHeader title="New production job" />
      <Panel>
        <ActionForm action={jobAction} className="grid gap-4 sm:grid-cols-2">
          <Field label="Title" required><Input name="title" required /></Field>
          <Field label="Garment type" required><Input name="garmentType" required /></Field>
          <Field label="Total quantity" required><Input type="number" name="totalQuantity" min={1} required /></Field>
          <Field label="Default piece rate (₦ per accepted piece)" required><Input name="defaultRate" required /></Field>
          <Field label="Due date"><Input type="date" name="dueDate" /></Field>
          <Field label="Facility"><Select name="facilityId"><option value="">—</option>{facilities.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</Select></Field>
          <Field label="Description" className="sm:col-span-2"><Textarea name="description" required /></Field>
          <Checkbox name="openToMarketplace" label="Publish to the tailor Production Marketplace" />
          <div className="sm:col-span-2"><SubmitButton>Create job</SubmitButton></div>
        </ActionForm>
      </Panel>
    </>
  );
}
