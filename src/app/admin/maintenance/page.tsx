import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { facilityScope } from "@/lib/auth/rbac";
import { PageHeader, Panel, StatusBadge, Table, Td } from "@/components/ui";
import { ActionForm } from "@/components/ui/action-form";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { removeMaintenanceWindowAction } from "../actions";

export default async function Maintenance() {
  const u = await requirePermission("equipment.manage");
  const scope = facilityScope(u.actor, "equipment.manage");
  const f = scope === "ALL" ? {} : { facilityId: { in: scope } };
  const [plans, windows, down] = await Promise.all([
    db.maintenancePlan.findMany({ where: { equipment: f }, include: { equipment: true }, orderBy: { nextDueAt: "asc" } }),
    db.maintenanceWindow.findMany({ where: { endsAt: { gt: new Date() }, OR: [{ equipment: f }, { workstation: f }] }, include: { equipment: true, workstation: true }, orderBy: { startsAt: "asc" } }),
    db.equipment.findMany({ where: { ...f, status: { in: ["UNDER_MAINTENANCE", "OUT_OF_SERVICE"] } } }),
  ]);
  return (
    <>
      <PageHeader title="Maintenance" description="Preventive schedules, active availability blocks and machines out of action." />
      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Out of action now"><Table head={["Machine", "Status"]} empty="All machines operational.">{down.map((e) => <tr key={e.id}><Td><Link className="text-forest-700" href={`/admin/equipment/${e.id}`}>{e.assetTag} · {e.name}</Link></Td><Td><StatusBadge status={e.status} /></Td></tr>)}</Table></Panel>
        <Panel title="Preventive schedule"><Table head={["Machine", "Task", "Due"]} empty="No schedules. Add them from a machine's page.">{plans.map((p) => <tr key={p.id}><Td><Link className="text-forest-700" href={`/admin/equipment/${p.equipmentId}`}>{p.equipment.assetTag}</Link></Td><Td>{p.task}</Td><Td className={p.nextDueAt < new Date() ? "font-medium text-red-700" : ""}>{fmtDate(p.nextDueAt)}</Td></tr>)}</Table></Panel>
        <Panel title="Upcoming & active blocks" className="xl:col-span-2"><Table head={["Resource", "From", "To", "Type", "Reason", ""]} empty="No blocks.">{windows.map((w) => <tr key={w.id}><Td>{w.equipment?.assetTag ?? w.workstation?.code}</Td><Td>{fmtDateTime(w.startsAt)}</Td><Td>{fmtDateTime(w.endsAt)}</Td><Td>{w.kind}</Td><Td>{w.reason}</Td><Td><ActionForm action={removeMaintenanceWindowAction}><input type="hidden" name="id" value={w.id} /><button className="text-xs text-red-700">Remove</button></ActionForm></Td></tr>)}</Table></Panel>
      </div>
    </>
  );
}
