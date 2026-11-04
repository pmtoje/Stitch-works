import { db, type Tx } from "./db";

export async function audit(
  entry: { actorId?: string | null; action: string; entityType: string; entityId: string; facilityId?: string | null; data?: unknown; ip?: string | null },
  tx: Tx | typeof db = db,
) {
  await tx.auditLog.create({
    data: {
      actorId: entry.actorId ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      facilityId: entry.facilityId ?? null,
      data: (entry.data ?? undefined) as never,
      ip: entry.ip ?? null,
    },
  });
}
