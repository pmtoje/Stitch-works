import { DashShell } from "@/components/dash/shell";
import type { NavGroup } from "@/components/dash/nav";
import { requireStaff } from "@/lib/auth/session";
import { can, type Permission } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";
export const metadata = { title: "Management", robots: { index: false } };

const ALL: { title: string; items: { href: string; label: string; perm: Permission }[] }[] = [
  { title: "Overview", items: [{ href: "/admin", label: "Operations dashboard", perm: "reports.view" }, { href: "/admin/reports", label: "Reports & exports", perm: "reports.view" }] },
  {
    title: "Facility",
    items: [
      { href: "/admin/bookings", label: "Bookings", perm: "booking.manage" },
      { href: "/admin/calendar", label: "Availability calendar", perm: "booking.manage" },
      { href: "/admin/equipment", label: "Equipment register", perm: "equipment.manage" },
      { href: "/admin/maintenance", label: "Maintenance", perm: "equipment.manage" },
      { href: "/admin/facilities", label: "Facilities & pricing", perm: "facility.manage" },
      { href: "/admin/materials", label: "Materials inventory", perm: "materials.manage" },
    ],
  },
  {
    title: "Production",
    items: [
      { href: "/admin/production/orders", label: "Bulk orders", perm: "production.view" },
      { href: "/admin/production/jobs", label: "Jobs & allocations", perm: "production.view" },
      { href: "/admin/production/qc", label: "Quality control", perm: "production.qc" },
      { href: "/admin/production/earnings", label: "Piece-rate earnings", perm: "production.view" },
    ],
  },
  {
    title: "Network",
    items: [
      { href: "/admin/tailors/applications", label: "Tailor applications", perm: "tailors.review" },
      { href: "/admin/tailors", label: "Tailors & teams", perm: "tailors.review" },
      { href: "/admin/memberships", label: "Memberships", perm: "memberships.manage" },
    ],
  },
  {
    title: "Academy",
    items: [
      { href: "/admin/academy/courses", label: "Courses & sessions", perm: "academy.manage" },
      { href: "/admin/academy/applications", label: "Admissions", perm: "academy.manage" },
      { href: "/admin/academy/teaching", label: "Teaching", perm: "academy.teach" },
      { href: "/admin/academy/certificates", label: "Certificates", perm: "academy.manage" },
    ],
  },
  { title: "Finance", items: [{ href: "/admin/finance", label: "Finance overview", perm: "finance.view" }, { href: "/admin/finance/invoices", label: "Invoices & payments", perm: "finance.view" }] },
  {
    title: "Engagement",
    items: [
      { href: "/admin/enquiries", label: "Enquiries", perm: "enquiries.manage" },
      { href: "/admin/cms", label: "Website content", perm: "cms.manage" },
    ],
  },
  {
    title: "System",
    items: [
      { href: "/admin/users", label: "Users & roles", perm: "users.manage" },
      { href: "/admin/notifications", label: "Notification log", perm: "users.manage" },
      { href: "/admin/audit", label: "Audit log", perm: "audit.view" },
    ],
  },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireStaff();
  const groups: NavGroup[] = ALL.map((g) => ({ title: g.title, items: g.items.filter((i) => can(user.actor, i.perm)) })).filter((g) => g.items.length);
  groups.push({ title: "Personal", items: [{ href: "/dashboard", label: "← My dashboard" }] });
  return <DashShell user={user} groups={groups} area="admin">{children}</DashShell>;
}
