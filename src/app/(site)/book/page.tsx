import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { Eyebrow } from "@/components/ui";
import { todayLocal, addDays } from "@/lib/time";
import { BookingEngine } from "./engine";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Book a Workspace — Sewing Machine & Tailoring Workspace Rental in Jos",
  description: "Reserve industrial sewing machines, overlockers, cutting tables and tailoring workstations by the hour, half day, full day or several days. Live availability and secure payment.",
};

export default async function BookPage() {
  const [user, facilities] = await Promise.all([
    getCurrentUser(),
    db.facility.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, city: true, operatingHours: true, requiresApproval: true, cancellationHours: true, maxConsecutiveDays: true, maxAdvanceDays: true, minBookingHours: true } }),
  ]);
  const today = todayLocal();
  return (
    <>
      <section className="border-b border-charcoal-900/10 bg-cream-100">
        <div className="container py-12 md:py-16">
          <Eyebrow>Book a workspace</Eyebrow>
          <h1 className="mt-3 max-w-3xl text-4xl leading-tight text-charcoal-900 md:text-6xl">Reserve workstations and machines.</h1>
          <p className="mt-4 max-w-2xl text-lg text-charcoal-600">Select a date and duration, then choose everything you need — one machine or a full production line — in a single reservation. Availability is live and checked again the moment you confirm.</p>
        </div>
      </section>
      <section className="container py-10">
        {facilities.length ? (
          <BookingEngine
            facilities={facilities.map((f) => ({ ...f, operatingHours: f.operatingHours as Record<string, [string, string] | null> }))}
            signedIn={!!user}
            minDate={today}
            maxDate={addDays(today, 90)}
          />
        ) : (
          <p className="text-charcoal-600">No facilities are open for booking yet.</p>
        )}
      </section>
    </>
  );
}
