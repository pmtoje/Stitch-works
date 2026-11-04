import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { channels } from "@/lib/notifications/channels";
import { PageHeader, StatusBadge, Table, Td } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";

export default async function NotificationLog() {
  await requirePermission("users.manage");
  const rows = await db.notificationDelivery.findMany({ orderBy: { createdAt: "desc" }, take: 200, include: { notification: true } });
  return (
    <>
      <PageHeader title="Notification log" description={`Channels configured: ${channels.map((c) => `${c.name} ${c.configured() ? "✓" : "✗ (not configured — deliveries are skipped)"}`).join(" · ")}`} />
      <Table head={["Queued", "Channel", "Recipient", "Title", "Attempts", "Status", "Error"]}>
        {rows.map((d) => <tr key={d.id}><Td>{fmtDateTime(d.createdAt)}</Td><Td>{d.channel}</Td><Td className="text-xs">{d.recipient}</Td><Td>{d.notification.title}</Td><Td>{d.attempts}</Td><Td><StatusBadge status={d.status} /></Td><Td className="text-xs text-stone-500">{d.error}</Td></tr>)}
      </Table>
    </>
  );
}
