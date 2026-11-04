import Link from "next/link";
import { Logo } from "../site/logo";
import { logoutAction } from "@/app/(auth)/actions";
import { DashNav, type NavGroup } from "./nav";
import { db } from "@/lib/db";

export async function DashShell({ user, groups, children, area }: { user: { id: string; fullName: string; email: string }; groups: NavGroup[]; children: React.ReactNode; area: "dashboard" | "admin" }) {
  const unread = await db.notification.count({ where: { userId: user.id, readAt: null } });
  return (
    <div className="min-h-screen bg-cream-100/50 lg:grid lg:grid-cols-[260px_1fr]">
      <aside className="border-b border-charcoal-900/10 bg-white lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto lg:border-b-0 lg:border-r">
        <div className="flex h-16 items-center justify-between px-5">
          <Logo />
        </div>
        <div className="px-5 pb-3">
          <p className={`inline-block px-2 py-0.5 text-[10px] font-semibold uppercase tracking-eyebrow ${area === "admin" ? "bg-charcoal-900 text-ochre-300" : "bg-forest-50 text-forest-700"}`}>{area === "admin" ? "Management" : "My StitchWorks"}</p>
        </div>
        <DashNav groups={groups} unread={unread} />
      </aside>
      <div className="min-w-0">
        <div className="flex h-16 items-center justify-between gap-4 border-b border-charcoal-900/10 bg-white px-5 md:px-8">
          <p className="truncate text-sm text-charcoal-600">Signed in as <span className="font-medium text-charcoal-900">{user.fullName}</span></p>
          <div className="flex items-center gap-4 text-sm">
            <Link href="/dashboard/notifications" className="relative text-charcoal-700 hover:text-forest-700">
              Notifications{unread ? <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-ochre-400 px-1.5 text-[11px] font-semibold text-charcoal-900">{unread}</span> : null}
            </Link>
            <Link href="/" className="hidden text-charcoal-700 hover:text-forest-700 sm:inline">Website</Link>
            <form action={logoutAction}><button className="text-charcoal-700 hover:text-red-700">Sign out</button></form>
          </div>
        </div>
        <main id="main" className="px-5 py-8 md:px-8 md:py-10">{children}</main>
      </div>
    </div>
  );
}
