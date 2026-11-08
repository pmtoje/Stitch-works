"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

export type NavGroup = { title: string; items: { href: string; label: string }[] };

export function DashNav({ groups, unread }: { groups: NavGroup[]; unread: number }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const active = (href: string) => path === href || (href.split("/").length > 2 && path.startsWith(href + "/"));
  return (
    <>
      <button type="button" className="mx-5 mb-3 flex w-[calc(100%-2.5rem)] items-center justify-between border border-charcoal-900/15 px-3 py-2 text-sm lg:hidden" aria-expanded={open} onClick={() => setOpen(!open)}>
        Menu {unread ? `· ${unread} new` : ""} <span aria-hidden>{open ? "−" : "+"}</span>
      </button>
      <nav aria-label="Dashboard" className={`${open ? "block" : "hidden"} px-3 pb-8 lg:block`}>
        {groups.map((g) => (
          <div key={g.title} className="mt-4">
            <p className="px-2 text-[10px] font-semibold uppercase tracking-eyebrow text-stone-500">{g.title}</p>
            <ul className="mt-1.5 space-y-0.5">
              {g.items.map((i) => (
                <li key={i.href}>
                  <Link href={i.href} onClick={() => setOpen(false)} className={`block px-2 py-1.5 text-[14px] ${active(i.href) ? "border-l-2 border-forest-700 bg-forest-50 font-medium text-forest-800" : "border-l-2 border-transparent text-charcoal-700 hover:bg-cream-100"}`}>
                    {i.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </>
  );
}
