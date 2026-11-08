import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { DL, Field, PageHeader, Panel, Select, StatusBadge, Table, Td } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { fmtDateTime, humanize } from "@/lib/format";
import { roleAction } from "../../actions";

const ROLES = ["CUSTOMER", "CORPORATE_CLIENT", "TAILOR", "STUDENT", "INSTRUCTOR", "FACILITY_MANAGER", "PRODUCTION_MANAGER", "FINANCE_OFFICER", "QC_OFFICER", "ACADEMY_ADMIN", "SUPER_ADMIN"];

export default async function UserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requirePermission("users.manage");
  const u = await db.user.findUnique({ where: { id }, include: { roles: { include: { facility: true } }, sessions: { orderBy: { lastSeenAt: "desc" }, take: 5 } } });
  if (!u) notFound();
  const [facilities, logs] = await Promise.all([db.facility.findMany(), db.auditLog.findMany({ where: { OR: [{ actorId: u.id }, { entityId: u.id }] }, orderBy: { createdAt: "desc" }, take: 30 })]);
  return (
    <>
      <PageHeader eyebrow="User" title={u.fullName} description={u.email} actions={<StatusBadge status={u.disabledAt ? "SUSPENDED" : "ACTIVE"} className="text-sm" />} />
      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Roles">
          <ul className="mb-4 space-y-2">{u.roles.map((r) => <li key={r.id} className="flex items-center justify-between text-sm"><span>{humanize(r.role)}{r.facility ? ` · ${r.facility.name}` : ""}</span><ActionForm action={roleAction} confirm={`Remove ${humanize(r.role)}?`}><input type="hidden" name="op" value="revoke" /><input type="hidden" name="userId" value={u.id} /><input type="hidden" name="roleId" value={r.id} /><button className="text-xs text-red-700">Remove</button></ActionForm></li>)}</ul>
          <ActionForm action={roleAction} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <input type="hidden" name="op" value="grant" /><input type="hidden" name="userId" value={u.id} />
            <Field label="Grant role"><Select name="role">{ROLES.map((r) => <option key={r} value={r}>{humanize(r)}</option>)}</Select></Field>
            <Field label="Limit to facility"><Select name="facilityId"><option value="">All facilities</option>{facilities.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</Select></Field>
            <SubmitButton size="sm">Grant</SubmitButton>
          </ActionForm>
          <ActionForm action={roleAction} className="mt-6 border-t border-charcoal-900/10 pt-4" confirm="Change account status?"><input type="hidden" name="userId" value={u.id} /><input type="hidden" name="op" value={u.disabledAt ? "enable" : "disable"} /><SubmitButton size="sm" variant={u.disabledAt ? "secondary" : "danger"}>{u.disabledAt ? "Re-enable account" : "Disable account & sign out everywhere"}</SubmitButton></ActionForm>
        </Panel>
        <Panel title="Account">
          <DL items={[["Phone", u.phone], ["Email verified", fmtDateTime(u.emailVerifiedAt)], ["2FA", u.totpEnabledAt ? "Enabled" : "Off"], ["Locked until", fmtDateTime(u.lockedUntil)], ["Joined", fmtDateTime(u.createdAt)]]} />
          <p className="mb-2 mt-5 text-sm font-semibold">Recent sessions</p>
          <ul className="space-y-1 text-xs text-stone-600">{u.sessions.map((s) => <li key={s.id}>{fmtDateTime(s.lastSeenAt)} · {s.ip} · {s.userAgent?.slice(0, 60)}</li>)}</ul>
        </Panel>
        <Panel title="Activity" className="xl:col-span-2"><Table head={["When", "Action", "Entity"]}>{logs.map((l) => <tr key={l.id}><Td>{fmtDateTime(l.createdAt)}</Td><Td>{l.action}</Td><Td className="font-mono text-xs">{l.entityType}:{l.entityId.slice(0, 12)}</Td></tr>)}</Table></Panel>
      </div>
    </>
  );
}
