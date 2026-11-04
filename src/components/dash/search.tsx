import { Button, Input, Select } from "../ui";
import { humanize } from "@/lib/format";

export function SearchBar({ q, status, statuses, extra, placeholder = "Search…" }: { q?: string; status?: string; statuses?: string[]; extra?: React.ReactNode; placeholder?: string }) {
  return (
    <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
      <Input name="q" defaultValue={q ?? ""} placeholder={placeholder} className="max-w-xs py-2" aria-label="Search" />
      {statuses ? <Select name="status" defaultValue={status ?? ""} className="max-w-[220px] py-2" aria-label="Status"><option value="">All statuses</option>{statuses.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}</Select> : null}
      {extra}
      <Button size="sm" variant="secondary" className="h-[42px]">Filter</Button>
    </form>
  );
}
