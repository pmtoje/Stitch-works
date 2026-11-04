import { db } from "@/lib/db";
import { getObject } from "@/lib/uploads";
import { getCurrentUser } from "@/lib/auth/session";
import { isStaff } from "@/lib/auth/rbac";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const up = await db.upload.findUnique({ where: { id } });
  if (!up) return new Response("Not found", { status: 404 });
  if (up.visibility !== "PUBLIC") {
    const u = await getCurrentUser();
    if (!u || (up.ownerId !== u.id && !isStaff(u.actor))) return new Response("Not found", { status: 404 });
  }
  const body = await getObject(up.storageKey).catch(() => null);
  if (!body) return new Response("Not found", { status: 404 });
  const inline = up.mimeType.startsWith("image/") || up.mimeType === "application/pdf" || up.mimeType.startsWith("video/");
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": up.mimeType,
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${up.originalName.replace(/"/g, "")}"`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; media-src 'self'; sandbox",
      "Cache-Control": up.visibility === "PUBLIC" ? "public, max-age=86400" : "private, no-store",
    },
  });
}
