"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { MAIN_NAV } from "./nav";

export function MobileMenu({ signedIn }: { signedIn: boolean }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <div className="xl:hidden">
      <button type="button" aria-expanded={open} aria-controls="mobile-nav" onClick={() => setOpen(!open)} className="flex h-11 w-11 items-center justify-center border border-charcoal-900/15">
        <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
        <span className="relative block h-3 w-5" aria-hidden>
          <span className={`absolute left-0 h-[1.5px] w-5 bg-charcoal-900 transition-transform ${open ? "top-1.5 rotate-45" : "top-0"}`} />
          <span className={`absolute left-0 top-1.5 h-[1.5px] w-5 bg-charcoal-900 transition-opacity ${open ? "opacity-0" : ""}`} />
          <span className={`absolute left-0 h-[1.5px] w-5 bg-charcoal-900 transition-transform ${open ? "top-1.5 -rotate-45" : "top-3"}`} />
        </span>
      </button>
      {open ? (
        <div id="mobile-nav" className="fixed inset-x-0 bottom-0 top-[var(--header-h,72px)] z-50 overflow-y-auto bg-cream-50">
          <nav className="container py-6" aria-label="Mobile">
            <ul className="divide-y divide-charcoal-900/10 border-y border-charcoal-900/10">
              {MAIN_NAV.map((n) => (
                <li key={n.href}>
                  <Link href={n.href} className={`flex items-center justify-between py-4 font-display text-2xl ${path === n.href ? "text-forest-700" : "text-charcoal-900"}`}>
                    {n.label}
                    <span aria-hidden className="text-ochre-500">→</span>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="mt-8 grid gap-3">
              <Link href="/book" className="flex h-12 items-center justify-center bg-forest-700 font-medium text-cream-50">Book a Workspace</Link>
              <Link href="/bulk-production#request" className="flex h-12 items-center justify-center border border-charcoal-900/20 font-medium">Request Bulk Production</Link>
              <Link href="/tailors" className="flex h-12 items-center justify-center border border-charcoal-900/20 font-medium">Join StitchWorks</Link>
              <Link href={signedIn ? "/dashboard" : "/login"} className="mt-2 text-center text-sm font-medium text-forest-700 underline underline-offset-4">{signedIn ? "Go to my dashboard" : "Sign in"}</Link>
            </div>
          </nav>
        </div>
      ) : null}
    </div>
  );
}
