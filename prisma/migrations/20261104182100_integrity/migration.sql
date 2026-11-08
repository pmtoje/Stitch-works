-- Integrity guarantees that must hold even if application code is bypassed.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 1. No two ACTIVE reservations of the same machine may overlap in time.
ALTER TABLE "BookingItem" ADD CONSTRAINT booking_item_equipment_no_overlap
  EXCLUDE USING gist ("equipmentId" WITH =, tsrange("startsAt", "endsAt", '[)') WITH &&)
  WHERE (active AND "equipmentId" IS NOT NULL);

-- 2. Same for workstations.
ALTER TABLE "BookingItem" ADD CONSTRAINT booking_item_workstation_no_overlap
  EXCLUDE USING gist ("workstationId" WITH =, tsrange("startsAt", "endsAt", '[)') WITH &&)
  WHERE (active AND "workstationId" IS NOT NULL);

-- 3. A booking item targets exactly one resource and has a positive duration.
ALTER TABLE "BookingItem" ADD CONSTRAINT booking_item_one_resource
  CHECK ((("equipmentId" IS NOT NULL)::int + ("workstationId" IS NOT NULL)::int) = 1);
ALTER TABLE "BookingItem" ADD CONSTRAINT booking_item_positive_span CHECK ("endsAt" > "startsAt");
ALTER TABLE "MaintenanceWindow" ADD CONSTRAINT maintenance_positive_span CHECK ("endsAt" > "startsAt");

-- 4. Money sanity.
ALTER TABLE "Invoice" ADD CONSTRAINT invoice_amounts_valid
  CHECK (amount >= 0 AND "amountPaid" >= 0 AND "amountRefunded" >= 0 AND "amountRefunded" <= "amountPaid");
ALTER TABLE "Payment" ADD CONSTRAINT payment_amount_positive CHECK (amount > 0);

-- 5. Allocation has exactly one assignee type; QC numbers add up.
ALTER TABLE "ProductionAllocation" ADD CONSTRAINT allocation_one_assignee
  CHECK ((("tailorId" IS NOT NULL)::int + ("teamId" IS NOT NULL)::int + ("partnerName" IS NOT NULL)::int) = 1);
ALTER TABLE "ProductionAllocation" ADD CONSTRAINT allocation_qty_positive CHECK (quantity > 0 AND rate >= 0);
ALTER TABLE "QualityInspection" ADD CONSTRAINT qc_totals
  CHECK ("acceptedQty" >= 0 AND "rejectedQty" >= 0 AND "reworkQty" >= 0
         AND "acceptedQty" + "rejectedQty" + "reworkQty" = "inspectedQty");

-- 6. Audit log is append-only.
CREATE OR REPLACE FUNCTION audit_log_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog is append-only';
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER audit_log_no_update BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();

-- 7. A successful payment can never be changed back or have its amount edited.
CREATE OR REPLACE FUNCTION payment_success_immutable() RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'SUCCEEDED' AND (NEW.status <> 'SUCCEEDED' OR NEW.amount <> OLD.amount OR NEW."invoiceId" <> OLD."invoiceId") THEN
    RAISE EXCEPTION 'Succeeded payments are immutable';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER payment_success_guard BEFORE UPDATE ON "Payment"
  FOR EACH ROW EXECUTE FUNCTION payment_success_immutable();
