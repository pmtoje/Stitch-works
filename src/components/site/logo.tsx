import Link from "next/link";
import { cx } from "../ui";

export function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cx("h-8 w-8", className)} aria-hidden>
      <rect x="1" y="1" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7 22 C 12 8, 20 8, 25 22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 2.5" />
      <line x1="16" y1="5" x2="16" y2="27" stroke="#d4a853" strokeWidth="1.5" />
      <circle cx="16" cy="8" r="1.6" fill="none" stroke="#d4a853" strokeWidth="1.2" />
    </svg>
  );
}

export function Logo({ light, className }: { light?: boolean; className?: string }) {
  return (
    <Link href="/" className={cx("group inline-flex items-center gap-2.5", light ? "text-cream-50" : "text-forest-700", className)} aria-label="StitchWorks Collective — home">
      <Mark />
      <span className="leading-none">
        <span className="block font-display text-[1.35rem] font-medium tracking-tight">StitchWorks</span>
        <span className={cx("block text-[9px] font-semibold uppercase tracking-[0.32em]", light ? "text-ochre-300" : "text-stone-500")}>Collective</span>
      </span>
    </Link>
  );
}
