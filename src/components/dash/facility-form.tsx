import type { Facility } from "@prisma/client";
import { Checkbox, Field, Input } from "../ui";
import { ActionForm, SubmitButton } from "../ui/action-form";
import { saveFacilityAction } from "@/app/admin/actions";

const DAYS: [string, string][] = [["mon", "Monday"], ["tue", "Tuesday"], ["wed", "Wednesday"], ["thu", "Thursday"], ["fri", "Friday"], ["sat", "Saturday"], ["sun", "Sunday"]];

export function FacilityForm({ f }: { f?: Facility }) {
  const hours = (f?.operatingHours ?? {}) as Record<string, [string, string] | null>;
  return (
    <ActionForm action={saveFacilityAction} className="space-y-6">
      {f ? <input type="hidden" name="id" value={f.id} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" required><Input name="name" defaultValue={f?.name} required /></Field>
        <Field label="Address"><Input name="address" defaultValue={f?.address} required /></Field>
        <Field label="City" required><Input name="city" defaultValue={f?.city} required /></Field>
        <Field label="State" required><Input name="state" defaultValue={f?.state} required /></Field>
        <Field label="Phone"><Input name="phone" defaultValue={f?.phone ?? ""} /></Field>
        <Field label="Email"><Input name="email" defaultValue={f?.email ?? ""} /></Field>
      </div>
      <fieldset>
        <legend className="mb-2 text-sm font-semibold">Operating hours</legend>
        <div className="space-y-2">
          {DAYS.map(([k, l]) => (
            <div key={k} className="grid grid-cols-[120px_80px_1fr_1fr] items-center gap-2 text-sm">
              <span>{l}</span>
              <Checkbox name={`${k}_open`} defaultChecked={!!hours[k] || !f} label="Open" />
              <Input type="time" name={`${k}_from`} defaultValue={hours[k]?.[0] ?? "08:00"} className="py-1.5" />
              <Input type="time" name={`${k}_to`} defaultValue={hours[k]?.[1] ?? "18:00"} className="py-1.5" />
            </div>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-2 text-sm font-semibold">Booking rules</legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Minimum hours (hourly)"><Input type="number" name="minBookingHours" min={1} defaultValue={f?.minBookingHours ?? 1} /></Field>
          <Field label="Max days in advance"><Input type="number" name="maxAdvanceDays" min={1} defaultValue={f?.maxAdvanceDays ?? 60} /></Field>
          <Field label="Max consecutive days"><Input type="number" name="maxConsecutiveDays" min={2} defaultValue={f?.maxConsecutiveDays ?? 7} /></Field>
          <Field label="Payment hold (minutes)"><Input type="number" name="paymentHoldMinutes" min={5} defaultValue={f?.paymentHoldMinutes ?? 30} /></Field>
          <Field label="Free cancellation (hours before)"><Input type="number" name="cancellationHours" min={0} defaultValue={f?.cancellationHours ?? 24} /></Field>
          <Field label="Upfront deposit %" hint="0 = pay in full"><Input type="number" name="depositPercent" min={0} max={100} defaultValue={f?.depositPercent ?? 0} /></Field>
        </div>
        <div className="mt-3 space-y-2">
          <Checkbox name="requiresApproval" defaultChecked={f?.requiresApproval} label="Bookings require manager approval before payment" />
          <Checkbox name="active" defaultChecked={f?.active ?? true} label="Facility is active and bookable" />
        </div>
      </fieldset>
      <SubmitButton>Save facility</SubmitButton>
    </ActionForm>
  );
}
