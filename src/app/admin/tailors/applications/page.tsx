import Link from "next/link";
import type { Prisma, TailorApplicationStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { PageHeader, StatusBadge, Table, Td } from "@/components/ui";
import { SearchBar } from "@/components/dash/search";
import { fmtDate } from "@/lib/format";

export default async function TailorApps({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  await requirePermission("tailors.review");
  const where: Prisma.TailorApplicationWhereInput = { ...(sp.status ? { status: sp.status as TailorApplicationStatus } : { status: { notIn: ["ACTIVE", "REJECTED"] } }), ...(sp.q ? { OR: [{ fullName: { contains: sp.q, mode: "insensitive" } }, { reference: { contains: sp.q, mode: "insensitive" } }, { phone: { contains: sp.q } }] } : {}) };
  const apps = await db.tailorApplication.findMany({ where, orderBy: { createdAt: "asc" }, include: { _count: { select: { files: true } } } });
  return (
    <>
      <PageHeader title="Tailor applications" description="Review experience and portfolio, shortlist, schedule practical assessments and approve." />
      <SearchBar q={sp.q} status={sp.status} statuses={["SUBMITTED", "UNDER_REVIEW", "SHORTLISTED", "ASSESSMENT_SCHEDULED", "APPROVED", "ONBOARDING", "ACTIVE", "REJECTED"]} placeholder="Name, reference, phone" />
      <Table head={["Reference", "Applicant", "Experience", "Specialisations", "Location", "Files", "Submitted", "Status"]} empty="No applications in this view.">
        {apps.map((a) => <tr key={a.id} className="hover:bg-cream-50"><Td><Link className="font-mono text-forest-700 hover:underline" href={`/admin/tailors/applications/${a.id}`}>{a.reference}</Link></Td><Td>{a.fullName}<div className="text-xs text-stone-500">{a.phone}</div></Td><Td>{a.yearsExperience} yrs</Td><Td className="max-w-[220px]">{a.specialisations.join(", ")}</Td><Td>{a.lga}, {a.state}</Td><Td>{a._count.files}</Td><Td>{fmtDate(a.createdAt)}</Td><Td><StatusBadge status={a.status} /></Td></tr>)}
      </Table>
    </>
  );
}
