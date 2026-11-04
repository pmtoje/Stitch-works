import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { PageHeader, Table, Td } from "@/components/ui";
import { SearchBar } from "@/components/dash/search";
import { fmtDateTime } from "@/lib/format";

export default async function Audit({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  await requirePermission("audit.view");
  const logs = await db.auditLog.findMany({ where: sp.q ? { OR: [{ action: { contains: sp.q } }, { entityType: { contains: sp.q } }, { entityId: sp.q }] } : {}, include: { actor: true }, orderBy: { createdAt: "desc" }, take: 300 });
  return (
    <>
      <PageHeader title="Audit log" description="Append-only (enforced by a database trigger). Every important administrative and financial action is recorded." />
      <SearchBar q={sp.q} placeholder="Action, entity type or ID" />
      <Table head={["When", "Actor", "Action", "Entity", "Details", "IP"]}>
        {logs.map((l) => <tr key={l.id}><Td className="whitespace-nowrap">{fmtDateTime(l.createdAt)}</Td><Td>{l.actor?.fullName ?? "system"}</Td><Td className="font-mono text-xs">{l.action}</Td><Td className="font-mono text-xs">{l.entityType}:{l.entityId.slice(0, 14)}</Td><Td className="max-w-[360px] truncate font-mono text-[11px] text-stone-500">{l.data ? JSON.stringify(l.data) : ""}</Td><Td className="text-xs">{l.ip ?? ""}</Td></tr>)}
      </Table>
    </>
  );
}
