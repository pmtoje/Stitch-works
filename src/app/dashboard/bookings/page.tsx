import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { LinkButton, PageHeader, StatusBadge, Table, Td } from "@/components/ui";
import { fmtDateTime, humanize, naira } from "@/lib/format";

export default async function MyBookings({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const u = await requireUser();
  const { view = "upcoming" } = await searchParams;
  const now = new Date();
  const bookings = await db.booking.findMany({
    where: { customerId: u.id, ...(view === "past" ? { OR: [{ endsAt: { lte: now } }, { status: { in: ["CANCELLED", "EXPIRED", "REJECTED", "COMPLETED"] } }] } : { endsAt: { gt: now }, status: { notIn: ["CANCELLED", "EXPIRED", "REJECTED", "COMPLETED"] } }) },
    orderBy: { startsAt: view === "past" ? "desc" : "asc" },
    include: { facility: true, items: { include: { equipment: true, workstation: true } } },
    take: 100,
  });
  return (
    <>
      <PageHeader title="Workspace bookings" actions={<LinkButton href="/book">New booking</LinkButton>} />
      <div className="mb-4 flex gap-2 text-sm">
        {["upcoming", "past"].map((v) => <Link key={v} href={`?view=${v}`} className={`border px-3 py-1.5 ${view === v ? "border-charcoal-900 bg-charcoal-900 text-cream-50" : "border-charcoal-900/15"}`}>{humanize(v)}</Link>)}
      </div>
      <Table head={["Reference", "When", "Items", "Total", "Status"]} empty="No bookings here.">
        {bookings.map((b) => {
          const names = [...new Set(b.items.map((i) => i.equipment?.name ?? i.workstation?.name))];
          return (
            <tr key={b.id} className="hover:bg-cream-50">
              <Td><Link className="font-mono text-forest-700 hover:underline" href={`/dashboard/bookings/${b.id}`}>{b.reference}</Link></Td>
              <Td>{fmtDateTime(b.startsAt)}<div className="text-xs text-stone-500">{humanize(b.durationType)}{b.days > 1 ? ` · ${b.days} days` : ""} · {b.facility.name}</div></Td>
              <Td className="max-w-[260px]">{names.slice(0, 3).join(", ")}{names.length > 3 ? ` +${names.length - 3}` : ""}</Td>
              <Td className="tabular-nums">{naira(b.total)}</Td>
              <Td><StatusBadge status={b.status} /></Td>
            </tr>
          );
        })}
      </Table>
    </>
  );
}
