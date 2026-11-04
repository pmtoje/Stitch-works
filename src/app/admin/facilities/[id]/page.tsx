import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/rbac";
import { Checkbox, Field, Input, PageHeader, Panel, Table } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { FacilityForm } from "@/components/dash/facility-form";
import { saveRateCardAction, saveWorkstationAction } from "../../actions";

export default async function FacilityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const u = await requirePermission("facility.manage");
  const f = await db.facility.findUnique({ where: { id }, include: { workstations: { orderBy: { code: "asc" } }, rateCards: true } });
  if (!f || !can(u.actor, "facility.manage", f.id)) notFound();
  const categories = await db.equipmentCategory.findMany({ orderBy: { sortOrder: "asc" } });
  return (
    <>
      <PageHeader eyebrow="Facility" title={f.name} />
      <div className="grid gap-6 2xl:grid-cols-2">
        <Panel title="Details & booking rules"><FacilityForm f={f} /></Panel>
        <div className="space-y-6">
          <Panel title="Rate cards by equipment category (₦)">
            <p className="mb-3 text-xs text-stone-500">Individual machines can override these in the equipment register. Categories without a rate card cannot be booked.</p>
            <div className="space-y-2">
              {categories.map((c) => {
                const r = f.rateCards.find((x) => x.categoryId === c.id);
                return (
                  <ActionForm key={c.id} action={saveRateCardAction} className="grid grid-cols-2 items-end gap-2 border-b border-charcoal-900/5 pb-3 sm:grid-cols-[1.5fr_repeat(5,1fr)_auto]">
                    <input type="hidden" name="facilityId" value={f.id} /><input type="hidden" name="categoryId" value={c.id} />
                    <p className="col-span-2 text-sm font-medium sm:col-span-1">{c.name}</p>
                    <Field label="Hourly"><Input name="hourlyRate" defaultValue={r?.hourlyRate ?? ""} className="py-1.5" required /></Field>
                    <Field label="Half day"><Input name="halfDayRate" defaultValue={r?.halfDayRate ?? ""} className="py-1.5" required /></Field>
                    <Field label="Full day"><Input name="fullDayRate" defaultValue={r?.fullDayRate ?? ""} className="py-1.5" required /></Field>
                    <Field label="Multi-day/day"><Input name="multiDayRate" defaultValue={r?.multiDayRate ?? ""} className="py-1.5" /></Field>
                    <Field label="Deposit"><Input name="securityDeposit" defaultValue={r?.securityDeposit ?? 0} className="py-1.5" /></Field>
                    <SubmitButton size="sm" variant="secondary">Save</SubmitButton>
                  </ActionForm>
                );
              })}
            </div>
          </Panel>
          <Panel title="Workstations">
            <Table head={["Code", "Name", "Hourly", "Half", "Full", "Multi", "Active", ""]}>
              {[...f.workstations, null].map((w) => (
                <tr key={w?.id ?? "new"}>
                  <td colSpan={8} className="p-2">
                    <ActionForm action={saveWorkstationAction} className="grid grid-cols-[70px_1fr_repeat(4,80px)_60px_auto] items-center gap-2">
                      <input type="hidden" name="facilityId" value={f.id} />{w ? <input type="hidden" name="id" value={w.id} /> : null}
                      <Input name="code" defaultValue={w?.code ?? ""} placeholder="WS-05" className="py-1.5" />
                      <Input name="name" defaultValue={w?.name ?? ""} placeholder="Workstation name" className="py-1.5" />
                      <Input name="hourlyRate" defaultValue={w?.hourlyRate ?? ""} className="py-1.5" />
                      <Input name="halfDayRate" defaultValue={w?.halfDayRate ?? ""} className="py-1.5" />
                      <Input name="fullDayRate" defaultValue={w?.fullDayRate ?? ""} className="py-1.5" />
                      <Input name="multiDayRate" defaultValue={w?.multiDayRate ?? ""} className="py-1.5" />
                      <Checkbox name="active" defaultChecked={w?.active ?? true} label="" />
                      <SubmitButton size="sm" variant="secondary">{w ? "Save" : "Add"}</SubmitButton>
                    </ActionForm>
                  </td>
                </tr>
              ))}
            </Table>
          </Panel>
        </div>
      </div>
    </>
  );
}
