import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { can, facilityScope } from "@/lib/auth/rbac";
import { LinkButton, PageHeader, StatusBadge, Table, Td } from "@/components/ui";

export default async function Facilities() {
  const u = await requirePermission("facility.manage");
  const scope = facilityScope(u.actor, "facility.manage");
  const list = await db.facility.findMany({ where: scope === "ALL" ? {} : { id: { in: scope } }, include: { _count: { select: { equipment: true, workstations: true, tailors: true } }, roles: { where: { role: "FACILITY_MANAGER" }, include: { user: true } } } });
  return (
    <>
      <PageHeader title="Facilities & pricing" description="Each production centre has its own operating hours, booking rules, inventory and rate cards." actions={can(u.actor, "facility.create") ? <LinkButton href="/admin/facilities/new">Add facility</LinkButton> : null} />
      <Table head={["Facility", "Location", "Manager", "Workstations", "Machines", "Tailors", "Status"]}>
        {list.map((f) => <tr key={f.id}><Td><Link href={`/admin/facilities/${f.id}`} className="text-forest-700 hover:underline">{f.name}</Link></Td><Td>{f.city}, {f.state}</Td><Td>{f.roles.map((r) => r.user.fullName).join(", ") || "—"}</Td><Td>{f._count.workstations}</Td><Td>{f._count.equipment}</Td><Td>{f._count.tailors}</Td><Td><StatusBadge status={f.active ? "ACTIVE" : "SUSPENDED"} /></Td></tr>)}
      </Table>
    </>
  );
}
