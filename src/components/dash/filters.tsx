import { Button, Input, Select } from "../ui";

/** Date-range + facility filter row (GET form, so the URL is shareable). */
export function RangeFilter({ from, to, facility, facilities, extra }: { from: string; to: string; facility?: string | null; facilities?: { id: string; name: string }[]; extra?: React.ReactNode }) {
  return (
    <form className="mb-6 flex flex-wrap items-end gap-3 border border-charcoal-900/10 bg-white p-3" method="get">
      <label className="text-xs text-stone-500">From<Input type="date" name="from" defaultValue={from} className="mt-1 py-1.5" /></label>
      <label className="text-xs text-stone-500">To<Input type="date" name="to" defaultValue={to} className="mt-1 py-1.5" /></label>
      {facilities && facilities.length > 1 ? (
        <label className="text-xs text-stone-500">Facility<Select name="facility" defaultValue={facility ?? ""} className="mt-1 py-1.5"><option value="">All facilities</option>{facilities.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</Select></label>
      ) : null}
      {extra}
      <Button size="sm" variant="secondary">Apply</Button>
    </form>
  );
}
