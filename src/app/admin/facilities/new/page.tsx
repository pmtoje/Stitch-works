import { requirePermission } from "@/lib/auth/session";
import { PageHeader, Panel } from "@/components/ui";
import { FacilityForm } from "@/components/dash/facility-form";

export default async function NewFacility() {
  await requirePermission("facility.create");
  return (<><PageHeader title="Add a facility" description="Each new production centre gets its own inventory, rates, managers and booking rules — no redesign required." /><Panel><FacilityForm /></Panel></>);
}
