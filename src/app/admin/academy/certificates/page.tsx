import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { Input, PageHeader, StatusBadge, Table, Td } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { fmtDate } from "@/lib/format";
import { revokeCertificateAction } from "../../actions";

export default async function Certificates() {
  await requirePermission("academy.manage");
  const certs = await db.certificate.findMany({ orderBy: { issuedAt: "desc" } });
  return (
    <>
      <PageHeader title="Certificates" description="Each certificate has a unique, non-sequential verification ID checkable at /verify." />
      <Table head={["Verification ID", "Holder", "Course", "Grade", "Issued", "Status", ""]} empty="No certificates issued yet.">
        {certs.map((c) => <tr key={c.id}><Td><Link className="font-mono text-forest-700" href={`/verify/${c.code}`}>{c.code}</Link></Td><Td>{c.holderName}</Td><Td>{c.courseTitle}</Td><Td>{c.grade}</Td><Td>{fmtDate(c.issuedAt)}</Td><Td><StatusBadge status={c.revokedAt ? "REVOKED_CANCELLED" : "ACTIVE"} /></Td><Td>{!c.revokedAt ? <ActionForm action={revokeCertificateAction} className="flex gap-1" confirm="Revoke this certificate?"><input type="hidden" name="certificateId" value={c.id} /><Input name="reason" placeholder="Reason" className="w-32 py-1 text-xs" required /><SubmitButton size="sm" variant="ghost">Revoke</SubmitButton></ActionForm> : null}</Td></tr>)}
      </Table>
    </>
  );
}
