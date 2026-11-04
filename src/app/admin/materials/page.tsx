import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { facilityScope } from "@/lib/auth/rbac";
import { Field, Input, PageHeader, Panel, Select, Table, Td } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { fmtDateTime, naira } from "@/lib/format";
import { materialAction } from "../actions";

export default async function Materials() {
  const u = await requirePermission("materials.manage");
  const scope = facilityScope(u.actor, "materials.manage");
  const facilities = await db.facility.findMany({ where: scope === "ALL" ? {} : { id: { in: scope } } });
  const [items, moves] = await Promise.all([
    db.materialItem.findMany({ where: { facilityId: { in: facilities.map((f) => f.id) } }, include: { facility: true }, orderBy: { name: "asc" } }),
    db.materialMovement.findMany({ where: { item: { facilityId: { in: facilities.map((f) => f.id) } } }, include: { item: true, order: true }, orderBy: { createdAt: "desc" }, take: 30 }),
  ]);
  return (
    <>
      <PageHeader title="Materials inventory" description="Fabric, thread, trims, zips, buttons and packaging — receipts and consumption linked to production orders." />
      <Table head={["SKU", "Item", "Kind", "On hand", "Reorder at", "Unit cost", "Value", "Facility"]} empty="No materials yet.">
        {items.map((i) => <tr key={i.id} className={i.quantity <= i.reorderLevel ? "bg-ochre-300/10" : ""}><Td className="font-mono text-xs">{i.sku}</Td><Td>{i.name}</Td><Td>{i.kind}</Td><Td className={i.quantity <= i.reorderLevel ? "font-semibold text-red-700" : ""}>{i.quantity} {i.unit}</Td><Td>{i.reorderLevel}</Td><Td>{naira(i.unitCost)}</Td><Td>{naira(Math.round(i.quantity * i.unitCost))}</Td><Td>{i.facility.name}</Td></tr>)}
      </Table>
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Panel title="Add material">
          <ActionForm action={materialAction} className="grid gap-3 sm:grid-cols-3" resetOnSuccess>
            <input type="hidden" name="op" value="create" />
            <Field label="Facility"><Select name="facilityId">{facilities.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</Select></Field>
            <Field label="SKU"><Input name="sku" required /></Field>
            <Field label="Name"><Input name="name" required /></Field>
            <Field label="Kind"><Select name="kind">{["FABRIC", "THREAD", "TRIM", "ZIP", "BUTTON", "PACKAGING", "OTHER"].map((k) => <option key={k}>{k}</option>)}</Select></Field>
            <Field label="Unit"><Input name="unit" placeholder="metres" required /></Field>
            <Field label="Reorder level"><Input name="reorderLevel" /></Field>
            <Field label="Unit cost (₦)"><Input name="unitCost" /></Field>
            <div className="self-end"><SubmitButton>Add</SubmitButton></div>
          </ActionForm>
        </Panel>
        <Panel title="Record receipt or consumption">
          <ActionForm action={materialAction} className="grid gap-3 sm:grid-cols-2" resetOnSuccess>
            <Field label="Movement"><Select name="op"><option value="receive">Receive stock</option><option value="consume">Consume for production</option></Select></Field>
            <Field label="Item"><Select name="itemId">{items.map((i) => <option key={i.id} value={i.id}>{i.sku} · {i.name}</option>)}</Select></Field>
            <input type="hidden" name="facilityId" value={facilities[0]?.id ?? ""} />
            <Field label="Quantity"><Input name="delta" required /></Field>
            <Field label="Production order ref"><Input name="orderRef" placeholder="PO-2026-00001" /></Field>
            <Field label="Reason" className="sm:col-span-2"><Input name="reason" /></Field>
            <SubmitButton>Record</SubmitButton>
          </ActionForm>
        </Panel>
      </div>
      <Panel title="Recent movements" className="mt-6"><Table head={["When", "Item", "Qty", "Order", "Reason"]}>{moves.map((m) => <tr key={m.id}><Td>{fmtDateTime(m.createdAt)}</Td><Td>{m.item.name}</Td><Td className={m.delta < 0 ? "text-red-700" : "text-forest-700"}>{m.delta > 0 ? "+" : ""}{m.delta}</Td><Td className="font-mono text-xs">{m.order?.reference ?? "—"}</Td><Td>{m.reason}</Td></tr>)}</Table></Panel>
    </>
  );
}
