import { PRODUCTION_FLOW } from "@/lib/production/orders";
import { fmtDate, humanize } from "@/lib/format";
import { cx } from "../ui";
import type { ProductionStatus } from "@prisma/client";

export function ProductionTimeline({ status, history }: { status: ProductionStatus; history: { to: ProductionStatus; createdAt: Date; note: string | null }[] }) {
  const idx = PRODUCTION_FLOW.indexOf(status);
  const reached = (s: ProductionStatus) => history.find((h) => h.to === s);
  return (
    <ol className="relative space-y-0">
      {PRODUCTION_FLOW.map((s, i) => {
        const h = [...history].reverse().find((x) => x.to === s) ?? reached(s);
        const done = idx >= 0 && i < idx;
        const current = i === idx;
        return (
          <li key={s} className="relative flex gap-4 pb-5 last:pb-0">
            {i < PRODUCTION_FLOW.length - 1 ? <span className={cx("absolute left-[7px] top-4 h-full w-px", done ? "bg-forest-600" : "bg-charcoal-900/10")} aria-hidden /> : null}
            <span className={cx("relative mt-1 h-[15px] w-[15px] shrink-0 border-2", done ? "border-forest-600 bg-forest-600" : current ? "border-ochre-500 bg-ochre-300" : "border-charcoal-900/20 bg-white")} aria-hidden />
            <div className="min-w-0">
              <p className={cx("text-sm", current ? "font-semibold text-charcoal-900" : done ? "text-charcoal-800" : "text-stone-400")}>{humanize(s)}{current ? <span className="sr-only"> (current stage)</span> : null}</p>
              {h && (done || current) ? <p className="text-xs text-stone-500">{fmtDate(h.createdAt)}{h.note ? ` · ${h.note}` : ""}</p> : null}
            </div>
          </li>
        );
      })}
      {idx < 0 ? <li className="mt-3 text-sm font-medium text-red-700">{humanize(status)}</li> : null}
    </ol>
  );
}
