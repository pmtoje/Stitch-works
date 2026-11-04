import { DashShell } from "@/components/dash/shell";
import type { NavGroup } from "@/components/dash/nav";
import { requireUser } from "@/lib/auth/session";
import { hasRole, isStaff } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";
export const metadata = { title: "My dashboard", robots: { index: false } };

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser("/dashboard");
  const a = user.actor;
  const groups: NavGroup[] = [
    { title: "Overview", items: [{ href: "/dashboard", label: "Dashboard" }, { href: "/dashboard/notifications", label: "Notifications" }] },
    {
      title: "Production services",
      items: [
        { href: "/dashboard/bookings", label: "Workspace bookings" },
        { href: "/dashboard/orders", label: "Production orders" },
        { href: "/dashboard/measurements", label: "Measurements" },
      ],
    },
    { title: "Billing", items: [{ href: "/dashboard/invoices", label: "Invoices & payments" }, { href: "/dashboard/membership", label: "Membership" }] },
  ];
  if (hasRole(a, "TAILOR")) {
    groups.push({ title: "Tailor", items: [{ href: "/dashboard/tailor", label: "Profile & portfolio" }, { href: "/dashboard/tailor/jobs", label: "Production jobs" }, { href: "/dashboard/tailor/earnings", label: "Piece-rate earnings" }] });
  } else {
    groups.push({ title: "Tailor network", items: [{ href: "/dashboard/application", label: "My tailor application" }] });
  }
  groups.push({ title: "Academy", items: [{ href: "/dashboard/academy", label: hasRole(a, "STUDENT") ? "Student portal" : "Academy applications" }] });
  groups.push({ title: "Account", items: [{ href: "/dashboard/security", label: "Profile & security" }, ...(isStaff(a) ? [{ href: "/admin", label: "→ Management console" }] : [])] });
  return <DashShell user={user} groups={groups} area="dashboard">{children}</DashShell>;
}
