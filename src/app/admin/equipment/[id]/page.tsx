import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { can, facilityScope } from "@/lib/auth/rbac";
import { DL, Field, Input, PageHeader, Panel, Select, StatusBadge, Table, Td, Textarea } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { EquipmentForm } from "@/components/dash/equipment-form";
import { fmtDate, fmtDateTime, naira } from "@/lib/format";
import { addMaintenanceWindowAction, deleteEquipmentAction, maintenancePlanAction, removeMaintenanceWindowAction, serviceLogAction } from "../../actions";

export default async function EquipmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const u = await requirePermission("equipment.manage");
  const e = await db.equipment.findUnique({ where: { id }, include: { category: true, maintenance: { orderBy: { startsAt: "desc" }, take: 20 }, serviceLogs: { orderBy: { performedAt: "desc" } }, maintenancePlans: true, bookingItems: { where: { active: true }, include: { booking: true } } } });
  if (!e || !can(u.actor, "equipment.manage", e.facilityId)) notFound();
  const scope = facilityScope(u.actor, "equipment.manage");
  const [facilities, categories] = await Promise.all([db.facility.findMany({ where: scope === "ALL" ? {} : { id: { in: scope } } }), db.equipmentCategory.findMany({ orderBy: { sortOrder: "asc" } })]);
  const revenue = e.bookingItems.filter((i) => ["CONFIRMED", "CHECKED_IN", "COMPLETED"].includes(i.booking.status)).reduce((s, i) => s + i.lineTotal, 0);
  const hours = e.bookingItems.reduce((s, i) => s + (i.endsAt.getTime() - i.startsAt.getTime()) / 3_600_000, 0);
  const repairCost = e.serviceLogs.reduce((s, l) => s + l.cost, 0);
  const downtime = e.serviceLogs.reduce((s, l) => s + l.downtimeHours, 0);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <>
      <PageHeader eyebrow={e.assetTag} title={e.name} description={e.category.name} actions={<StatusBadge status={e.status} className="text-sm" />} />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="border border-charcoal-900/10 bg-white p-4"><p className="text-xs uppercase text-stone-500">Booked hours</p><p className="font-display text-2xl">{Math.round(hours)}</p></div>
        <div className="border border-charcoal-900/10 bg-white p-4"><p className="text-xs uppercase text-stone-500">Rental revenue</p><p className="font-display text-2xl">{naira(revenue)}</p></div>
        <div className="border border-charcoal-900/10 bg-white p-4"><p className="text-xs uppercase text-stone-500">Repair & service cost</p><p className="font-display text-2xl">{naira(repairCost)}</p></div>
        <div className="border border-charcoal-900/10 bg-white p-4"><p className="text-xs uppercase text-stone-500">Net contribution</p><p className="font-display text-2xl">{naira(revenue - repairCost)}</p><p className="text-xs text-stone-500">{downtime} h downtime</p></div>
      </div>
      <div className="grid gap-6 2xl:grid-cols-2">
        <Panel title="Details"><EquipmentForm e={e} facilities={facilities} categories={categories} />
          <ActionForm action={deleteEquipmentAction} className="mt-6 border-t border-charcoal-900/10 pt-4" confirm="Remove this equipment? Machines with booking history are retired instead."><input type="hidden" name="id" value={e.id} /><SubmitButton variant="ghost" size="sm" className="text-red-700">Remove / retire equipment</SubmitButton></ActionForm>
        </Panel>
        <div className="space-y-6">
          <Panel title="Block availability (maintenance / downtime)">
            <ActionForm action={addMaintenanceWindowAction} className="grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="equipmentId" value={e.id} />
              <Field label="From"><div className="flex gap-1"><Input type="date" name="startDate" defaultValue={today} required /><Input type="time" name="startTime" defaultValue="08:00" /></div></Field>
              <Field label="To"><div className="flex gap-1"><Input type="date" name="endDate" defaultValue={today} required /><Input type="time" name="endTime" defaultValue="18:00" /></div></Field>
              <Field label="Type"><Select name="kind"><option value="PLANNED">Planned maintenance</option><option value="DOWNTIME">Unplanned downtime</option><option value="DAMAGE">Damage</option></Select></Field>
              <Field label="Reason"><Input name="reason" required /></Field>
              <div className="sm:col-span-2"><SubmitButton>Block</SubmitButton></div>
            </ActionForm>
            <ul className="mt-4 divide-y divide-charcoal-900/5 text-sm">{e.maintenance.map((m) => <li key={m.id} className="flex items-center justify-between gap-2 py-2"><span>{fmtDateTime(m.startsAt)} → {fmtDateTime(m.endsAt)} · {m.kind.toLowerCase()} · {m.reason}</span><ActionForm action={removeMaintenanceWindowAction}><input type="hidden" name="id" value={m.id} /><button className="text-xs text-red-700">Remove</button></ActionForm></li>)}</ul>
          </Panel>
          <Panel title="Record service, repair or damage">
            <ActionForm action={serviceLogAction} className="grid gap-3 sm:grid-cols-2" resetOnSuccess>
              <input type="hidden" name="equipmentId" value={e.id} />
              <Field label="Type"><Select name="kind"><option value="SERVICE">Service</option><option value="REPAIR">Repair</option><option value="DAMAGE">Damage</option><option value="INSPECTION">Inspection</option></Select></Field>
              <Field label="Linked booking ref (damage)"><Input name="bookingRef" placeholder="BK-2026-00012" /></Field>
              <Field label="Cost (₦)"><Input name="cost" /></Field>
              <Field label="Downtime (hours)"><Input name="downtimeHours" /></Field>
              <Field label="Performed by"><Input name="performedBy" /></Field>
              <Field label="Set status"><Select name="newStatus"><option value="">Unchanged</option>{["AVAILABLE", "UNDER_MAINTENANCE", "OUT_OF_SERVICE"].map((s) => <option key={s}>{s}</option>)}</Select></Field>
              {e.maintenancePlans.length ? <Field label="Completes schedule"><Select name="planId"><option value="">—</option>{e.maintenancePlans.map((p) => <option key={p.id} value={p.id}>{p.task}</option>)}</Select></Field> : null}
              <Field label="Description" className="sm:col-span-2"><Textarea name="description" rows={2} required /></Field>
              <div className="sm:col-span-2"><SubmitButton>Record</SubmitButton></div>
            </ActionForm>
          </Panel>
          <Panel title="Preventive maintenance schedule">
            <ul className="mb-4 space-y-1 text-sm">{e.maintenancePlans.map((p) => <li key={p.id} className="flex justify-between"><span>{p.task} · every {p.intervalDays} days</span><span className={p.nextDueAt < new Date() ? "text-red-700" : ""}>Due {fmtDate(p.nextDueAt)}</span></li>)}</ul>
            <ActionForm action={maintenancePlanAction} className="grid grid-cols-[1fr_100px_150px_auto] items-end gap-2" resetOnSuccess>
              <input type="hidden" name="equipmentId" value={e.id} />
              <Field label="Task"><Input name="task" placeholder="Oil & clean" required /></Field>
              <Field label="Every (days)"><Input name="intervalDays" type="number" required /></Field>
              <Field label="Next due"><Input name="nextDueAt" type="date" /></Field>
              <SubmitButton size="sm" variant="secondary">Add</SubmitButton>
            </ActionForm>
          </Panel>
          <Panel title="Service history">
            <Table head={["Date", "Type", "Description", "Cost", "Downtime"]} empty="No records.">
              {e.serviceLogs.map((l) => <tr key={l.id}><Td>{fmtDate(l.performedAt)}</Td><Td>{l.kind}</Td><Td>{l.description}</Td><Td>{naira(l.cost)}</Td><Td>{l.downtimeHours}h</Td></tr>)}
            </Table>
            <div className="mt-3"><DL items={[["Acquired", fmtDate(e.acquiredAt)], ["Cost", naira(e.acquisitionCost)]]} /></div>
          </Panel>
        </div>
      </div>
    </>
  );
}
