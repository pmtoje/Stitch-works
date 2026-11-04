import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/rbac";
import { Field, Input, PageHeader, Panel, Select, StatusBadge, Table, Td } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { SearchBar } from "@/components/dash/search";
import { teamAction, tailorVerificationAction } from "../actions";

export default async function TailorsAdmin({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const u = await requirePermission("tailors.review");
  const tailors = await db.tailor.findMany({
    where: sp.q ? { OR: [{ code: { contains: sp.q, mode: "insensitive" } }, { user: { fullName: { contains: sp.q, mode: "insensitive" } } }] } : {},
    include: { user: { include: { memberships: { where: { status: "ACTIVE" }, include: { plan: true } } } }, facility: true, allocations: { include: { submissions: { include: { inspection: true } } } } },
    orderBy: { code: "asc" },
  });
  const [teams, facilities] = await Promise.all([db.tailorTeam.findMany({ include: { members: { include: { tailor: { include: { user: true } } } } } }), db.facility.findMany()]);
  const manage = can(u.actor, "production.manage");
  return (
    <>
      <PageHeader title="Tailors & teams" description="Verified StitchWorks tailors, their membership, facility and performance." />
      <SearchBar q={sp.q} placeholder="Name or tailor ID" />
      <Table head={["Tailor ID", "Name", "Specialisations", "Facility", "Membership", "Accepted pcs", "QC rate", "Verification"]} empty="No tailors yet.">
        {tailors.map((t) => {
          const subs = t.allocations.flatMap((a) => a.submissions);
          const acc = subs.reduce((s, x) => s + (x.inspection?.acceptedQty ?? 0), 0);
          const insp = subs.reduce((s, x) => s + (x.inspection?.inspectedQty ?? 0), 0);
          return (
            <tr key={t.id}>
              <Td className="font-mono">{t.code}</Td><Td>{t.user.fullName}<div className="text-xs text-stone-500">{t.user.phone}</div></Td><Td>{t.specialisations.join(", ")}</Td><Td>{t.facility?.name ?? "—"}</Td><Td>{t.user.memberships[0]?.plan.name ?? "—"}</Td><Td>{acc}</Td><Td>{insp ? `${Math.round((acc / insp) * 100)}%` : "—"}</Td>
              <Td><ActionForm action={tailorVerificationAction} className="flex items-center gap-1"><input type="hidden" name="tailorId" value={t.id} /><StatusBadge status={t.verification} /><Select name="verification" defaultValue={t.verification} className="w-28 py-1 text-xs"><option>VERIFIED</option><option>UNVERIFIED</option><option>SUSPENDED</option></Select><Select name="facilityId" defaultValue={t.facilityId ?? ""} className="w-28 py-1 text-xs">{facilities.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</Select><SubmitButton size="sm" variant="ghost">Save</SubmitButton></ActionForm></Td>
            </tr>
          );
        })}
      </Table>
      <Panel title="Production teams" className="mt-8">
        <div className="grid gap-4 md:grid-cols-2">
          {teams.map((tm) => (
            <div key={tm.id} className="border border-charcoal-900/10 p-4">
              <p className="font-medium">{tm.name}</p>
              <ul className="mt-2 space-y-1 text-sm">{tm.members.map((m) => <li key={m.tailorId} className="flex justify-between">{m.tailor.code} · {m.tailor.user.fullName}{manage ? <ActionForm action={teamAction}><input type="hidden" name="op" value="remove" /><input type="hidden" name="teamId" value={tm.id} /><input type="hidden" name="tailorId" value={m.tailorId} /><button className="text-xs text-red-700">Remove</button></ActionForm> : null}</li>)}</ul>
              {manage ? <ActionForm action={teamAction} className="mt-3 flex gap-2"><input type="hidden" name="op" value="add" /><input type="hidden" name="teamId" value={tm.id} /><Select name="tailorId" className="py-1.5">{tailors.map((t) => <option key={t.id} value={t.id}>{t.code} · {t.user.fullName}</option>)}</Select><SubmitButton size="sm" variant="secondary">Add</SubmitButton></ActionForm> : null}
            </div>
          ))}
        </div>
        {manage ? <ActionForm action={teamAction} className="mt-4 flex items-end gap-2"><input type="hidden" name="op" value="create" /><Field label="New team name"><Input name="name" required /></Field><SubmitButton variant="secondary">Create team</SubmitButton></ActionForm> : null}
      </Panel>
    </>
  );
}
