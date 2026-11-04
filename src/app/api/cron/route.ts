import { expireStaleHolds } from "@/lib/booking/service";
import { runMembershipLifecycle } from "@/lib/memberships";
import { dispatchPending } from "@/lib/notifications";
import { reconcilePending } from "@/lib/payments/service";
import { sendBookingReminders, sendMaintenanceAlerts } from "@/lib/jobs";
import { safeEqual } from "@/lib/crypto";

// Call every 5–15 minutes from a scheduler (Vercel Cron, GitHub Actions, cron + curl):
//   curl -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) return new Response("Unauthorized", { status: 401 });
  const result = {
    expiredHolds: await expireStaleHolds(),
    memberships: await runMembershipLifecycle(),
    reminders: await sendBookingReminders(),
    maintenance: await sendMaintenanceAlerts(),
    reconciled: await reconcilePending(),
    notifications: await dispatchPending(200),
  };
  return Response.json(result);
}
