import Link from "next/link";
import type { StudentApplicationStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { PageHeader, StatusBadge, Table, Td } from "@/components/ui";
import { SearchBar } from "@/components/dash/search";
import { fmtDate } from "@/lib/format";

export default async function Admissions({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  await requirePermission("academy.manage");
  const apps = await db.studentApplication.findMany({ where: { ...(sp.status ? { status: sp.status as StudentApplicationStatus } : {}), ...(sp.q ? { OR: [{ fullName: { contains: sp.q, mode: "insensitive" } }, { reference: { contains: sp.q, mode: "insensitive" } }] } : {}) }, include: { session: { include: { course: true } }, invoices: true }, orderBy: { createdAt: "desc" } });
  return (
    <>
      <PageHeader title="Admissions" />
      <SearchBar q={sp.q} status={sp.status} statuses={["SUBMITTED", "UNDER_REVIEW", "ACCEPTED", "AWAITING_PAYMENT", "REGISTERED", "IN_TRAINING", "COMPLETED", "CERTIFIED", "REJECTED", "WITHDRAWN"]} placeholder="Name or reference" />
      <Table head={["Reference", "Applicant", "Course · session", "Fees", "Submitted", "Status"]} empty="No applications.">
        {apps.map((a) => <tr key={a.id}><Td><Link className="font-mono text-forest-700 hover:underline" href={`/admin/academy/applications/${a.id}`}>{a.reference}</Link></Td><Td>{a.fullName}<div className="text-xs text-stone-500">{a.phone}</div></Td><Td>{a.session.course.title}<div className="text-xs text-stone-500">{a.session.name}</div></Td><Td>{a.invoices.map((i) => <StatusBadge key={i.id} status={i.status} className="mr-1" />)}</Td><Td>{fmtDate(a.createdAt)}</Td><Td><StatusBadge status={a.status} /></Td></tr>)}
      </Table>
    </>
  );
}
