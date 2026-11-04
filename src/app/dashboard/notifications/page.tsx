import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { Button, EmptyState, PageHeader } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";
import { markNotificationsReadAction } from "../actions";

export default async function Notifications() {
  const u = await requireUser();
  const items = await db.notification.findMany({ where: { userId: u.id }, orderBy: { createdAt: "desc" }, take: 100 });
  return (
    <>
      <PageHeader title="Notifications" actions={<form action={markNotificationsReadAction}><Button variant="secondary" size="sm">Mark all as read</Button></form>} />
      {items.length ? (
        <ul className="divide-y divide-charcoal-900/10 border border-charcoal-900/10 bg-white">
          {items.map((n) => (
            <li key={n.id} className={`px-5 py-4 ${n.readAt ? "" : "border-l-4 border-l-ochre-400"}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-medium">{n.title}</p>
                <p className="text-xs text-stone-500">{fmtDateTime(n.createdAt)}</p>
              </div>
              <p className="mt-1 whitespace-pre-line text-sm text-charcoal-600">{n.body}</p>
              {n.link ? <Link href={n.link} className="mt-2 inline-block text-sm text-forest-700 hover:underline">Open →</Link> : null}
            </li>
          ))}
        </ul>
      ) : <EmptyState title="No notifications yet" />}
    </>
  );
}
