import Link from "next/link";
import type { EquipmentStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { facilityScope } from "@/lib/auth/rbac";
import { Checkbox, Field, Input, LinkButton, PageHeader, Panel, StatusBadge, Table, Td } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { SearchBar } from "@/components/dash/search";
import { saveCategoryAction } from "../actions";

export default async function EquipmentRegister({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const u = await requirePermission("equipment.manage");
  const scope = facilityScope(u.actor, "equipment.manage");
  const where: Prisma.EquipmentWhereInput = {
    ...(scope === "ALL" ? {} : { facilityId: { in: scope } }),
    ...(sp.status ? { status: sp.status as EquipmentStatus } : {}),
    ...(sp.category ? { categoryId: sp.category } : {}),
    ...(sp.q ? { OR: [{ assetTag: { contains: sp.q, mode: "insensitive" } }, { name: { contains: sp.q, mode: "insensitive" } }, { serialNumber: { contains: sp.q, mode: "insensitive" } }, { model: { contains: sp.q, mode: "insensitive" } }] } : {}),
  };
  const [items, categories] = await Promise.all([
    db.equipment.findMany({ where, include: { category: true, facility: true, _count: { select: { bookingItems: true } } }, orderBy: [{ facility: { name: "asc" } }, { assetTag: "asc" }] }),
    db.equipmentCategory.findMany({ orderBy: { sortOrder: "asc" }, include: { _count: { select: { equipment: true } } } }),
  ]);
  return (
    <>
      <PageHeader title="Equipment register" description={`${items.length} machine(s). Equipment marked under maintenance, out of service or retired cannot be booked.`} actions={<LinkButton href="/admin/equipment/new">Add equipment</LinkButton>} />
      <SearchBar q={sp.q} status={sp.status} statuses={["AVAILABLE", "IN_USE", "UNDER_MAINTENANCE", "OUT_OF_SERVICE", "RETIRED"]} placeholder="Asset tag, name, serial" extra={<select name="category" defaultValue={sp.category ?? ""} className="h-[42px] border border-charcoal-900/20 px-2"><option value="">All categories</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>} />
      <Table head={["Asset tag", "Machine", "Category", "Facility", "Condition", "Bookings", "Status"]} empty="No equipment matches.">
        {items.map((e) => (
          <tr key={e.id} className="hover:bg-cream-50">
            <Td><Link href={`/admin/equipment/${e.id}`} className="font-mono text-forest-700 hover:underline">{e.assetTag}</Link></Td>
            <Td>{e.name}<div className="text-xs text-stone-500">{[e.brand, e.model].filter(Boolean).join(" ")}</div></Td>
            <Td>{e.category.name}</Td><Td>{e.facility.name}</Td><Td>{e.condition.toLowerCase()}</Td><Td>{e._count.bookingItems}</Td>
            <Td><StatusBadge status={e.status} />{!e.bookable ? <span className="ml-1 text-xs text-stone-500">not bookable</span> : null}</Td>
          </tr>
        ))}
      </Table>
      <Panel title="Equipment categories" className="mt-8">
        <div className="space-y-2">
          {[...categories, null].map((c) => (
            <ActionForm key={c?.id ?? "new"} action={saveCategoryAction} className="grid grid-cols-[1fr_1.5fr_70px_80px_auto] items-end gap-2">
              {c ? <input type="hidden" name="id" value={c.id} /> : null}
              <Field label={c ? `${c._count.equipment} machines` : "New category"}><Input name="name" defaultValue={c?.name ?? ""} placeholder="Category name" className="py-1.5" /></Field>
              <Field label="Description"><Input name="description" defaultValue={c?.description ?? ""} className="py-1.5" /></Field>
              <Field label="Order"><Input name="sortOrder" defaultValue={c?.sortOrder ?? 0} className="py-1.5" /></Field>
              <Checkbox name="active" defaultChecked={c?.active ?? true} label="Active" />
              <SubmitButton size="sm" variant="secondary">{c ? "Save" : "Add"}</SubmitButton>
            </ActionForm>
          ))}
        </div>
      </Panel>
    </>
  );
}
