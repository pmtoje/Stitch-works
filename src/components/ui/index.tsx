import Link from "next/link";
import clsx from "clsx";
import type { ComponentProps, ReactNode } from "react";
import { humanize } from "@/lib/format";

export const cx = clsx;

type Variant = "primary" | "secondary" | "ghost" | "light" | "danger" | "gold";
const variants: Record<Variant, string> = {
  primary: "bg-forest-700 text-cream-50 hover:bg-forest-800 border border-forest-700",
  secondary: "border border-charcoal-900/20 text-charcoal-900 hover:border-charcoal-900 bg-transparent",
  ghost: "text-forest-700 hover:bg-forest-50 border border-transparent",
  light: "bg-cream-50 text-charcoal-900 hover:bg-white border border-cream-50",
  danger: "bg-red-700 text-white hover:bg-red-800 border border-red-700",
  gold: "bg-ochre-400 text-charcoal-900 hover:bg-ochre-300 border border-ochre-400",
};
const sizes = { sm: "h-9 px-3 text-sm", md: "h-11 px-5 text-[15px]", lg: "h-12 px-7 text-base" };

export function buttonClass(variant: Variant = "primary", size: keyof typeof sizes = "md", extra?: string) {
  return cx("inline-flex items-center justify-center gap-2 font-medium tracking-tight transition-colors disabled:cursor-not-allowed disabled:opacity-50", variants[variant], sizes[size], extra);
}

export function Button({ variant = "primary", size = "md", className, ...p }: ComponentProps<"button"> & { variant?: Variant; size?: keyof typeof sizes }) {
  return <button className={buttonClass(variant, size, className)} {...p} />;
}

export function LinkButton({ variant = "primary", size = "md", className, arrow, children, ...p }: ComponentProps<typeof Link> & { variant?: Variant; size?: keyof typeof sizes; arrow?: boolean }) {
  return (
    <Link className={buttonClass(variant, size, className)} {...p}>
      {children}
      {arrow ? <span aria-hidden>→</span> : null}
    </Link>
  );
}

export function Eyebrow({ children, light, className }: { children: ReactNode; light?: boolean; className?: string }) {
  return <p className={cx(light ? "eyebrow-light" : "eyebrow", className)}>{children}</p>;
}

export function SectionHeading({ index, eyebrow, title, intro, light, className }: { index?: string; eyebrow: string; title: ReactNode; intro?: ReactNode; light?: boolean; className?: string }) {
  return (
    <div className={cx("max-w-3xl", className)}>
      <Eyebrow light={light}>
        {index ? <span className="mr-3 font-mono tracking-normal opacity-70">{index}</span> : null}
        {eyebrow}
      </Eyebrow>
      <h2 className={cx("mt-4 text-[2rem] leading-[1.08] md:text-5xl", light ? "text-cream-50" : "text-charcoal-900")}>{title}</h2>
      {intro ? <p className={cx("mt-5 text-lg leading-relaxed", light ? "text-cream-200/80" : "text-charcoal-600")}>{intro}</p> : null}
    </div>
  );
}

export function Card({ className, children, ...p }: ComponentProps<"div">) {
  return (
    <div className={cx("border border-charcoal-900/10 bg-white", className)} {...p}>
      {children}
    </div>
  );
}

export function Panel({ title, actions, children, className }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("border border-charcoal-900/10 bg-white", className)}>
      {title || actions ? (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-charcoal-900/10 px-5 py-3.5">
          <h2 className="font-sans text-[15px] font-semibold tracking-tight text-charcoal-900">{title}</h2>
          {actions}
        </header>
      ) : null}
      <div className="p-5">{children}</div>
    </section>
  );
}

const statusTones: Record<string, string> = {
  green: "bg-forest-50 text-forest-700 ring-forest-600/20",
  amber: "bg-ochre-300/25 text-ochre-700 ring-ochre-500/30",
  red: "bg-red-50 text-red-700 ring-red-600/20",
  grey: "bg-charcoal-900/5 text-charcoal-600 ring-charcoal-900/10",
  blue: "bg-sky-50 text-sky-800 ring-sky-700/20",
};
const toneFor = (s: string) => {
  if (/(CONFIRMED|PAID|SUCCEEDED|ACTIVE|APPROVED|COMPLETED|DELIVERED|CERTIFIED|VERIFIED|AVAILABLE|ACCEPTED|REGISTERED|RESOLVED|SENT|PRESENT)$/.test(s)) return "green";
  if (/(PENDING|AWAITING|REVIEW|SUBMITTED|ISSUED|PARTIALLY|SHORTLISTED|SCHEDULED|ONBOARDING|NEW|DRAFT|QUOTATION|LATE|IN_PROGRESS|PENDING_QC)/.test(s)) return "amber";
  if (/(CANCELLED|REJECTED|FAILED|EXPIRED|VOID|DECLINED|SUSPENDED|OUT_OF_SERVICE|ABSENT|REFUNDED|ABANDONED|RETIRED)/.test(s)) return "red";
  if (/(MAINTENANCE|CHECKED_IN|IN_TRAINING|IN_USE|INSPECTED|DISPATCHED|SOURCING|CUTTING|PRODUCTION|QUALITY|FINISHING|READY)/.test(s)) return "blue";
  return "grey";
};
export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return <span className={cx("inline-flex items-center whitespace-nowrap rounded-sm px-2 py-0.5 text-xs font-medium ring-1 ring-inset", statusTones[toneFor(status)], className)}>{humanize(status)}</span>;
}

export function Field({ label, hint, error, children, required, className }: { label: string; hint?: ReactNode; error?: string; children: ReactNode; required?: boolean; className?: string }) {
  return (
    <label className={cx("block", className)}>
      <span className="mb-1.5 block text-sm font-medium text-charcoal-800">
        {label}
        {required ? <span className="ml-0.5 text-ochre-600">*</span> : null}
      </span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-stone-500">{hint}</span> : null}
      {error ? <span className="mt-1 block text-xs text-red-700">{error}</span> : null}
    </label>
  );
}

const inputBase = "block w-full border border-charcoal-900/20 bg-white px-3 py-2.5 text-charcoal-900 placeholder:text-stone-400 focus:border-forest-600 focus:outline-none focus:ring-1 focus:ring-forest-600 disabled:bg-cream-100";
export const Input = (p: ComponentProps<"input">) => <input {...p} className={cx(inputBase, p.className)} />;
export const Textarea = (p: ComponentProps<"textarea">) => <textarea rows={4} {...p} className={cx(inputBase, p.className)} />;
export const Select = (p: ComponentProps<"select">) => <select {...p} className={cx(inputBase, "pr-8", p.className)} />;

export function Checkbox({ label, ...p }: ComponentProps<"input"> & { label: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 text-sm text-charcoal-700">
      <input type="checkbox" {...p} className="mt-0.5 h-4 w-4 shrink-0 accent-forest-700" />
      <span>{label}</span>
    </label>
  );
}

export function EmptyState({ title, body, action }: { title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="border border-dashed border-charcoal-900/20 px-6 py-12 text-center">
      <p className="font-display text-xl text-charcoal-900">{title}</p>
      {body ? <p className="mx-auto mt-2 max-w-md text-sm text-stone-600">{body}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-charcoal-900/10 pb-6">
      <div>
        {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
        <h1 className="mt-2 text-3xl text-charcoal-900 md:text-[2.5rem]">{title}</h1>
        {description ? <p className="mt-2 max-w-2xl text-charcoal-600">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function StatTile({ label, value, sub, href }: { label: string; value: ReactNode; sub?: ReactNode; href?: string }) {
  const inner = (
    <>
      <p className="text-xs font-medium uppercase tracking-wider text-stone-500">{label}</p>
      <p className="mt-2 font-display text-3xl text-charcoal-900 tabular-nums">{value}</p>
      {sub ? <p className="mt-1 text-xs text-stone-500">{sub}</p> : null}
    </>
  );
  return href ? (
    <Link href={href} className="block border border-charcoal-900/10 bg-white p-4 transition-colors hover:border-forest-600">
      {inner}
    </Link>
  ) : (
    <div className="border border-charcoal-900/10 bg-white p-4">{inner}</div>
  );
}

export function Table({ head, children, empty }: { head: ReactNode[]; children: ReactNode; empty?: ReactNode }) {
  const isEmpty = Array.isArray(children) ? children.length === 0 : !children;
  return (
    <div className="overflow-x-auto border border-charcoal-900/10 bg-white">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="border-b border-charcoal-900/10 bg-cream-100/60 text-xs uppercase tracking-wider text-stone-500">
          <tr>{head.map((h, i) => <th key={i} className="px-4 py-3 font-medium">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-charcoal-900/5">{children}</tbody>
      </table>
      {isEmpty ? <div className="px-4 py-10 text-center text-sm text-stone-500">{empty ?? "Nothing here yet."}</div> : null}
    </div>
  );
}
export const Td = ({ className, ...p }: ComponentProps<"td">) => <td className={cx("px-4 py-3 align-top", className)} {...p} />;

export function Alert({ tone = "info", children }: { tone?: "info" | "success" | "error" | "warn"; children: ReactNode }) {
  const t = { info: "border-forest-600/30 bg-forest-50 text-forest-800", success: "border-forest-600/30 bg-forest-50 text-forest-800", error: "border-red-600/30 bg-red-50 text-red-800", warn: "border-ochre-500/40 bg-ochre-300/20 text-ochre-700" }[tone];
  return <div role={tone === "error" ? "alert" : "status"} className={cx("border-l-4 px-4 py-3 text-sm", t)}>{children}</div>;
}

export function DL({ items }: { items: [ReactNode, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-[minmax(140px,max-content)_1fr]">
      {items.map(([k, v], i) => (
        <div key={i} className="contents">
          <dt className="text-stone-500">{k}</dt>
          <dd className="text-charcoal-900">{v ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
