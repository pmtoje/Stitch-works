import Link from "next/link";
import type { BookingStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { facilityScope } from "@/lib/auth/rbac";
import { LinkButton, PageHeader, StatusBadge, Table, Td } from "@/components/ui";
import { SearchBar } from "@/components/dash/search";
import { expireStaleHolds } from "@/lib/booking/service";
import { fmtDateTime, humanize, naira } from "@/lib/format";

const STATUSES = ["PENDING_APPROVAL", "PENDING_PAYMENT", "CONFIRMED", "CHECKED_IN", "COMPLETED", "CANCELLED", "REJECTED", "EXPIRED"];

export default async function AdminBookings({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const u = await requirePermission("booking.manage");
  await expireStaleHolds();
  const scope = facilityScope(u.actor, "booking.manage");
  const where: Prisma.BookingWhereInput = {
    ...(scope === "ALL" ? {} : { facilityId: { in: scope } }),
    ...(sp.status ? { status: sp.status as BookingStatus } : {}),
    ...(sp.q ? { OR: [{ reference: { contains: sp.q, mode: "insensitive" } }, { customer: { fullName: { contains: sp.q, mode: "insensitive" } } }, { customer: { email: { contains: sp.q, mode: "insensitive" } } }] } : {}),
    ...(sp.date ? { startsAt: { gte: new Date(sp.date + "T00:00:00+01:00"), lt: new Date(new Date(sp.date + "T00:00:00+01:00").getTime() + 86_400_000) } } : {}),
  };
  const bookings = await db.booking.findMany({ where, orderBy: { startsAt: sp.status === "PENDING_APPROVAL" ? "asc" : "desc" }, take: 200, include: { customer: true, facility: true, _count: { select: { items: true } } } });
  const pending = await db.booking.count({ where: { status: "PENDING_APPROVAL", ...(scope === "ALL" ? {} : { facilityId: { in: scope } }) } });
  return (
    <>
      <PageHeader title="Bookings" description={pending ? `${pending} booking(s) awaiting approval.` : "All workspace and machine reservations."} actions={<><LinkButton href="/admin/bookings?status=PENDING_APPROVAL" variant="secondary">Approval queue</LinkButton><LinkButton href="/admin/bookings/new">Book for a customer</LinkButton></>} />
      <SearchBar q={sp.q} status={sp.status} statuses={STATUSES} placeholder="Reference, name or email" extra={<input type="date" name="date" defaultValue={sp.date} className="h-[42px] border border-charcoal-900/20 px-2" aria-label="Date" />} />
      <Table head={["Reference", "Customer", "Starts", "Type", "Items", "Total", "Status"]} empty="No bookings match.">
        {bookings.map((b) => (
          <tr key={b.id} className="hover:bg-cream-50">
            <Td><Link href={`/admin/bookings/${b.id}`} className="font-mono text-forest-700 hover:underline">{b.reference}</Link></Td>
            <Td>{b.customer.fullName}<div className="text-xs text-stone-500">{b.customer.email}</div></Td>
            <Td>{fmtDateTime(b.startsAt)}<div className="text-xs text-stone-500">{b.facility.name}</div></Td>
            <Td>{humanize(b.durationType)}{b.days > 1 ? ` ×${b.days}` : ""}</Td>
            <Td>{b._count.items / b.days}</Td>
            <Td className="tabular-nums">{naira(b.total)}</Td>
            <Td><StatusBadge status={b.status} /></Td>
          </tr>
        ))}
      </Table>
    </>
  );
}
