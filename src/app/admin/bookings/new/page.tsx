import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { facilityScope } from "@/lib/auth/rbac";
import { Checkbox, Field, Input, PageHeader, Panel, Select, Textarea } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { adminCreateBookingAction } from "../../actions";

export default async function NewBooking({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const u = await requirePermission("booking.manage");
  const scope = facilityScope(u.actor, "booking.manage");
  const facilities = await db.facility.findMany({ where: scope === "ALL" ? { active: true } : { id: { in: scope } } });
  const facility = facilities.find((f) => f.id === sp.facility) ?? facilities[0];
  if (!facility) return <p>No facility.</p>;
  const [equipment, workstations] = await Promise.all([db.equipment.findMany({ where: { facilityId: facility.id, bookable: true, status: { notIn: ["RETIRED"] } }, include: { category: true }, orderBy: { assetTag: "asc" } }), db.workstation.findMany({ where: { facilityId: facility.id, active: true } })]);
  return (
    <>
      <PageHeader title="Book for a customer" description="Walk-in or phone bookings. Availability, pricing and member discounts are validated exactly as for online bookings." />
      {facilities.length > 1 ? <form className="mb-4 flex gap-2"><Select name="facility" defaultValue={facility.id} className="max-w-xs">{facilities.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</Select><button className="border px-3">Switch</button></form> : null}
      <ActionForm action={adminCreateBookingAction} className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <input type="hidden" name="facilityId" value={facility.id} />
        <Panel title="Customer & time">
          <div className="space-y-4">
            <Field label="Customer email" hint="The customer must have a StitchWorks account."><Input type="email" name="customerEmail" required /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Date"><Input type="date" name="date" required /></Field>
              <Field label="Duration"><Select name="durationType"><option value="HOURLY">Hourly</option><option value="HALF_DAY">Half day</option><option value="FULL_DAY">Full day</option><option value="MULTI_DAY">Multi-day</option></Select></Field>
              <Field label="Start (hourly)"><Input type="time" step={1800} name="startTime" /></Field>
              <Field label="End (hourly)"><Input type="time" step={1800} name="endTime" /></Field>
              <Field label="Half-day session"><Select name="halfDaySlot"><option value="AM">Morning</option><option value="PM">Afternoon</option></Select></Field>
              <Field label="Days (multi-day)"><Input type="number" name="days" min={2} /></Field>
            </div>
            <Field label="Notes"><Textarea name="notes" rows={2} /></Field>
          </div>
        </Panel>
        <Panel title="Items">
          <div className="grid gap-2 sm:grid-cols-2">
            {workstations.map((w) => <Checkbox key={w.id} name="workstationIds" value={w.id} label={`${w.name} (${w.code})`} />)}
            {equipment.map((e) => <Checkbox key={e.id} name="equipmentIds" value={e.id} label={<>{e.name} <span className="font-mono text-xs text-stone-500">{e.assetTag}{e.status !== "AVAILABLE" ? ` · ${e.status.toLowerCase()}` : ""}</span></>} />)}
          </div>
          <div className="mt-6"><SubmitButton>Create booking</SubmitButton></div>
        </Panel>
      </ActionForm>
    </>
  );
}
