import Link from "next/link";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { isStaff } from "@/lib/auth/rbac";
import { Logo } from "./logo";
import { MAIN_NAV } from "./nav";
import { MobileMenu } from "./mobile-menu";
import { buttonClass } from "../ui";

export async function SiteHeader() {
  const user = await getCurrentUser();
  const now = new Date();
  const announcement = await db.announcement
    .findFirst({ where: { active: true, startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }] }, orderBy: { startsAt: "desc" } })
    .catch(() => null);
  return (
    <header className="sticky top-0 z-40 border-b border-charcoal-900/10 bg-cream-50/95 backdrop-blur supports-[backdrop-filter]:bg-cream-50/85">
      <div className="hidden bg-forest-800 text-cream-100 md:block">
        <div className="container flex h-9 items-center justify-between text-xs">
          <p className="truncate">
            {announcement ? (
              announcement.link ? (
                <Link href={announcement.link} className="hover:underline">{announcement.message} →</Link>
              ) : (
                announcement.message
              )
            ) : (
              <span className="text-cream-200/80">Shared garment production · Machine &amp; workspace rental · Bulk manufacturing · Academy</span>
            )}
          </p>
          <div className="flex shrink-0 items-center gap-5">
            <Link href="/verify" className="hover:text-ochre-300">Verify a certificate</Link>
            <Link href="/memberships" className="hover:text-ochre-300">Memberships</Link>
            {user ? (
              <Link href={isStaff(user.actor) ? "/admin" : "/dashboard"} className="font-medium text-ochre-300 hover:text-ochre-300/80">
                {isStaff(user.actor) ? "Management" : "My dashboard"} · {user.fullName.split(" ")[0]}
              </Link>
            ) : (
              <Link href="/login" className="font-medium text-ochre-300 hover:text-ochre-300/80">Sign in</Link>
            )}
          </div>
        </div>
      </div>
      <div className="container flex h-[72px] items-center justify-between gap-6">
        <Logo />
        <nav aria-label="Main" className="hidden xl:block">
          <ul className="flex items-center gap-6 text-[14px] font-medium text-charcoal-700">
            {MAIN_NAV.slice(1).map((n) => (
              <li key={n.href}>
                <Link href={n.href} className="whitespace-nowrap py-2 hover:text-forest-700">{n.label.replace("Become a StitchWorks Tailor", "Become a Tailor").replace("StitchWorks Academy", "Academy")}</Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/tailors" className={buttonClass("secondary", "sm", "hidden lg:inline-flex")}>Join StitchWorks</Link>
          <Link href="/book" className={buttonClass("primary", "sm", "hidden sm:inline-flex")}>Book a Workspace</Link>
          <MobileMenu signedIn={!!user} />
        </div>
      </div>
    </header>
  );
}
