import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { facilityScope } from "@/lib/auth/rbac";
import { PageHeader, Panel } from "@/components/ui";
import { EquipmentForm } from "@/components/dash/equipment-form";

export default async function NewEquipment() {
  const u = await requirePermission("equipment.manage");
  const scope = facilityScope(u.actor, "equipment.manage");
  const [facilities, categories] = await Promise.all([db.facility.findMany({ where: scope === "ALL" ? {} : { id: { in: scope } } }), db.equipmentCategory.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } })]);
  return (<><PageHeader title="Add equipment" /><Panel><EquipmentForm facilities={facilities} categories={categories} /></Panel></>);
}
