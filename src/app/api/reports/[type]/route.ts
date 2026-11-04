import { getCurrentUser } from "@/lib/auth/session";
import { can, facilityScope } from "@/lib/auth/rbac";
import { parseRange } from "@/lib/analytics";
import { REPORTS, toCsv, toXlsx } from "@/lib/reports";
import { audit } from "@/lib/audit";

export async function GET(req: Request, { params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  const def = REPORTS[type];
  if (!def) return new Response("Not found", { status: 404 });
  const u = await getCurrentUser();
  if (!u || !can(u.actor, def.perm)) return new Response("Forbidden", { status: 403 });
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const r = parseRange(sp);
  let facilityId = sp.facility || undefined;
  const scope = facilityScope(u.actor, def.perm);
  if (scope !== "ALL") facilityId = facilityId && scope.includes(facilityId) ? facilityId : scope[0];
  const rows = await def.run({ from: r.from, to: r.to, facilityId, status: sp.status || undefined, q: sp.q || undefined, categoryId: sp.category || undefined });
  await audit({ actorId: u.id, action: "report.export", entityType: "Report", entityId: type, data: { format: sp.format ?? "csv", from: r.fromStr, to: r.toStr, rows: rows.length } });
  const name = `stitchworks-${type}-${r.fromStr}-to-${r.toStr}`;
  if (sp.format === "xlsx") {
    return new Response(new Uint8Array(await toXlsx(def.title, rows)), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${name}.xlsx"`, "Cache-Control": "no-store" } });
  }
  return new Response("﻿" + toCsv(rows), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}.csv"`, "Cache-Control": "no-store" } });
}
