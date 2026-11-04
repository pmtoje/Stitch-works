import Link from "next/link";
import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { PageHeader, StatusBadge, Table, Td } from "@/components/ui";
import { SearchBar } from "@/components/dash/search";
import { fmtDate, humanize } from "@/lib/format";

export default async function Users({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  await requirePermission("users.manage");
  const users = await db.user.findMany({ where: { ...(sp.q ? { OR: [{ fullName: { contains: sp.q, mode: "insensitive" } }, { email: { contains: sp.q, mode: "insensitive" } }] } : {}), ...(sp.status ? { roles: { some: { role: sp.status as Role } } } : {}) }, include: { roles: { include: { facility: true } } }, orderBy: { createdAt: "desc" }, take: 300 });
  return (
    <>
      <PageHeader title="Users & roles" description="Users can hold several roles (e.g. a tailor who is also an Academy student). Facility managers can be scoped to specific facilities." />
      <SearchBar q={sp.q} status={sp.status} statuses={["CUSTOMER", "CORPORATE_CLIENT", "TAILOR", "STUDENT", "INSTRUCTOR", "FACILITY_MANAGER", "PRODUCTION_MANAGER", "FINANCE_OFFICER", "QC_OFFICER", "ACADEMY_ADMIN", "SUPER_ADMIN"]} placeholder="Name or email" />
      <Table head={["Name", "Email", "Roles", "2FA", "Joined", "Status"]}>
        {users.map((u) => <tr key={u.id}><Td><Link className="text-forest-700 hover:underline" href={`/admin/users/${u.id}`}>{u.fullName}</Link></Td><Td>{u.email}</Td><Td className="text-xs">{u.roles.map((r) => humanize(r.role) + (r.facility ? ` (${r.facility.name})` : "")).join(", ")}</Td><Td>{u.totpEnabledAt ? "On" : "—"}</Td><Td>{fmtDate(u.createdAt)}</Td><Td><StatusBadge status={u.disabledAt ? "SUSPENDED" : "ACTIVE"} /></Td></tr>)}
      </Table>
    </>
  );
}
