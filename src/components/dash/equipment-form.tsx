import type { Equipment } from "@prisma/client";
import { Checkbox, Field, Input, Select, Textarea } from "../ui";
import { ActionForm, SubmitButton } from "../ui/action-form";
import { saveEquipmentAction } from "@/app/admin/actions";

export function EquipmentForm({ e, facilities, categories }: { e?: Equipment; facilities: { id: string; name: string }[]; categories: { id: string; name: string }[] }) {
  const d = (x: Date | null | undefined) => (x ? x.toISOString().slice(0, 10) : "");
  return (
    <ActionForm action={saveEquipmentAction} className="space-y-4">
      {e ? <input type="hidden" name="id" value={e.id} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Asset tag (unique equipment ID)" required><Input name="assetTag" defaultValue={e?.assetTag} placeholder="SW-JOS-SS-007" required /></Field>
        <Field label="Machine name" required><Input name="name" defaultValue={e?.name} required /></Field>
        <Field label="Category" required><Select name="categoryId" defaultValue={e?.categoryId}>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
        <Field label="Facility" required><Select name="facilityId" defaultValue={e?.facilityId}>{facilities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
        <Field label="Brand"><Input name="brand" defaultValue={e?.brand ?? ""} /></Field>
        <Field label="Model"><Input name="model" defaultValue={e?.model ?? ""} /></Field>
        <Field label="Serial number"><Input name="serialNumber" defaultValue={e?.serialNumber ?? ""} /></Field>
        <Field label="Condition"><Select name="condition" defaultValue={e?.condition ?? "GOOD"}>{["NEW", "EXCELLENT", "GOOD", "FAIR", "POOR"].map((c) => <option key={c}>{c}</option>)}</Select></Field>
        <Field label="Status"><Select name="status" defaultValue={e?.status ?? "AVAILABLE"}>{["AVAILABLE", "IN_USE", "UNDER_MAINTENANCE", "OUT_OF_SERVICE", "RETIRED"].map((c) => <option key={c}>{c}</option>)}</Select></Field>
        <Field label="Acquisition date"><Input type="date" name="acquiredAt" defaultValue={d(e?.acquiredAt)} /></Field>
        <Field label="Acquisition cost (₦)"><Input name="acquisitionCost" defaultValue={e?.acquisitionCost ?? ""} /></Field>
      </div>
      <fieldset>
        <legend className="mb-2 text-sm font-semibold">Rate override (₦) — leave blank to use the category rate card</legend>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Hourly"><Input name="hourlyRate" defaultValue={e?.hourlyRate ?? ""} /></Field>
          <Field label="Half day"><Input name="halfDayRate" defaultValue={e?.halfDayRate ?? ""} /></Field>
          <Field label="Full day"><Input name="fullDayRate" defaultValue={e?.fullDayRate ?? ""} /></Field>
          <Field label="Multi-day / day"><Input name="multiDayRate" defaultValue={e?.multiDayRate ?? ""} /></Field>
        </div>
      </fieldset>
      <Field label="Notes"><Textarea name="notes" rows={2} defaultValue={e?.notes ?? ""} /></Field>
      <Checkbox name="bookable" defaultChecked={e?.bookable ?? true} label="Available for customer booking" />
      <SubmitButton>{e ? "Save changes" : "Add to register"}</SubmitButton>
    </ActionForm>
  );
}
