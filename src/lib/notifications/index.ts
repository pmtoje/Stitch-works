import { db, type Tx } from "../db";
import { channels } from "./channels";

export type NotifyInput = {
  userId?: string | null;
  // For people without accounts (e.g. enquiry senders) or staff inboxes.
  email?: string | null;
  phone?: string | null;
  kind: string;
  title: string;
  body: string;
  link?: string | null;
  channels?: ("EMAIL" | "SMS" | "WHATSAPP")[];
};

/**
 * Records an in-app notification and queues deliveries (outbox pattern). Call
 * inside the business transaction so notifications are only queued if it commits,
 * then call dispatchPending() after commit to send.
 */
export async function notify(input: NotifyInput, tx: Tx | typeof db = db) {
  let email = input.email ?? null;
  let phone = input.phone ?? null;
  if (input.userId && (!email || !phone)) {
    const u = await tx.user.findUnique({ where: { id: input.userId }, select: { email: true, phone: true } });
    email ??= u?.email ?? null;
    phone ??= u?.phone ?? null;
  }
  const wanted = input.channels ?? ["EMAIL", "SMS", "WHATSAPP"];
  const deliveries = [];
  if (wanted.includes("EMAIL") && email) deliveries.push({ channel: "EMAIL", recipient: email });
  if (wanted.includes("SMS") && phone) deliveries.push({ channel: "SMS", recipient: phone });
  if (wanted.includes("WHATSAPP") && phone) deliveries.push({ channel: "WHATSAPP", recipient: phone });
  return tx.notification.create({
    data: {
      userId: input.userId ?? null,
      kind: input.kind,
      title: input.title,
      body: input.body,
      link: input.link ?? null,
      deliveries: { create: deliveries },
    },
  });
}

/** Notify every user holding one of the given staff roles. */
export async function notifyStaff(roles: string[], input: Omit<NotifyInput, "userId">, tx: Tx | typeof db = db) {
  const users = await tx.userRole.findMany({ where: { role: { in: roles as never } }, select: { userId: true }, distinct: ["userId"] });
  for (const u of users) await notify({ ...input, userId: u.userId, channels: input.channels ?? ["EMAIL"] }, tx);
}

/** Sends queued deliveries. Unconfigured channels are marked SKIPPED (visible to admins). */
export async function dispatchPending(limit = 50) {
  if (process.env.NOTIFY_DRY_RUN === "1") return { sent: 0, skipped: 0, failed: 0 };
  const queued = await db.notificationDelivery.findMany({
    where: { status: "QUEUED", attempts: { lt: 5 } },
    include: { notification: true },
    take: limit,
    orderBy: { createdAt: "asc" },
  });
  const stats = { sent: 0, skipped: 0, failed: 0 };
  for (const d of queued) {
    const ch = channels.find((c) => c.name === d.channel);
    if (!ch || !ch.configured()) {
      if (d.channel === "EMAIL" && process.env.NODE_ENV !== "production") {
        console.info(`[email:dev] to=${d.recipient} subject="${d.notification.title}"\n${d.notification.body}\n${d.notification.link ?? ""}`);
      }
      await db.notificationDelivery.update({ where: { id: d.id }, data: { status: "SKIPPED", error: "Channel not configured" } });
      stats.skipped++;
      continue;
    }
    try {
      await ch.send(d.recipient, d.notification.title, d.notification.body, d.notification.link);
      await db.notificationDelivery.update({ where: { id: d.id }, data: { status: "SENT", sentAt: new Date(), attempts: { increment: 1 } } });
      stats.sent++;
    } catch (e) {
      const attempts = d.attempts + 1;
      await db.notificationDelivery.update({
        where: { id: d.id },
        data: { attempts, status: attempts >= 5 ? "FAILED" : "QUEUED", error: String((e as Error).message).slice(0, 500) },
      });
      stats.failed++;
    }
  }
  return stats;
}

/** Fire-and-forget dispatch after a request completes. */
export function kickDispatch() {
  dispatchPending().catch((e) => console.error("notification dispatch failed", e));
}
