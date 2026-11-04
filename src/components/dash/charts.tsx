import { naira } from "@/lib/format";

/**
 * Single-series bar charts (one hue, so no legend is needed — the panel title names the series).
 * Each bar carries a native tooltip and the data is also available as a table / export.
 */
export function ColumnChart({ data, format = "naira", label }: { data: { key: string; label: string; value: number }[]; format?: "naira" | "number"; label: string }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const fmt = (v: number) => (format === "naira" ? naira(v) : v.toLocaleString());
  if (!data.some((d) => d.value > 0)) return <p className="py-10 text-center text-sm text-stone-500">No data for this period.</p>;
  const peak = data.reduce((a, b) => (b.value > a.value ? b : a));
  return (
    <figure aria-label={label}>
      <div className="relative flex h-48 items-end gap-[2px] border-b border-charcoal-900/15">
        {[0.5, 1].map((t) => <div key={t} className="pointer-events-none absolute inset-x-0 border-t border-dashed border-charcoal-900/10" style={{ bottom: `${t * 100}%` }} aria-hidden />)}
        {data.map((d) => (
          <div key={d.key} className="group relative flex h-full flex-1 items-end" title={`${d.label}: ${fmt(d.value)}`}>
            <div className="w-full rounded-t-[4px] bg-forest-600 transition-colors group-hover:bg-forest-800" style={{ height: `${(d.value / max) * 100}%`, minHeight: d.value ? 2 : 0 }} />
            <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap bg-charcoal-900 px-2 py-1 text-[11px] text-cream-50 group-hover:block">{d.label}: {fmt(d.value)}</span>
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-stone-500"><span>{data[0]?.label}</span><span>Peak {peak.label}: {fmt(peak.value)}</span><span>{data[data.length - 1]?.label}</span></div>
    </figure>
  );
}

export function BarList({ data, format = "naira" }: { data: { label: string; value: number; sub?: string }[]; format?: "naira" | "number" | "pct" }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const fmt = (v: number) => (format === "naira" ? naira(v) : format === "pct" ? `${v}%` : v.toLocaleString());
  if (!data.length) return <p className="py-6 text-center text-sm text-stone-500">No data for this period.</p>;
  return (
    <ul className="space-y-3">
      {data.map((d) => (
        <li key={d.label} title={`${d.label}: ${fmt(d.value)}`}>
          <div className="flex justify-between gap-3 text-sm"><span className="text-charcoal-800">{d.label}</span><span className="tabular-nums text-charcoal-900">{fmt(d.value)}{d.sub ? <span className="ml-2 text-xs text-stone-500">{d.sub}</span> : null}</span></div>
          <div className="mt-1 h-2 bg-cream-200"><div className="h-2 rounded-r-[4px] bg-forest-600" style={{ width: `${(d.value / max) * 100}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}

export function Meter({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <div className="flex justify-between text-sm"><span>{label}</span><span className="tabular-nums font-medium">{value}%</span></div>
      <div className="mt-1 h-2.5 bg-cream-200" role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} aria-label={label}><div className="h-2.5 bg-forest-600" style={{ width: `${Math.min(value, 100)}%` }} /></div>
    </div>
  );
}
