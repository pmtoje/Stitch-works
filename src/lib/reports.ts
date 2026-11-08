import ExcelJS from "exceljs";
import { db } from "./db";
import type { Permission } from "./auth/rbac";
import type { Prisma } from "@prisma/client";

export type ReportFilters = { from: Date; to: Date; facilityId?: string; status?: string; q?: string; categoryId?: string };
type Row = Record<string, string | number | null>;
type ReportDef = { title: string; perm: Permission; filters: ("facility" | "status" | "q" | "category")[]; run: (f: ReportFilters) => Promise<Row[]> };

const d = (x: Date | null | undefined) => (x ? x.toISOString().replace("T", " ").slice(0, 16) : "");
const contains = (q?: string) => (q ? { contains: q, mode: "insensitive" as const } : undefined);

export const REPORTS: Record<string, ReportDef> = {
  bookings: {
    title: "Workspace booking report", perm: "booking.manage", filters: ["facility", "status", "q"],
    run: async (f) => (await db.booking.findMany({ where: { startsAt: { gte: f.from, lte: f.to }, ...(f.facilityId ? { facilityId: f.facilityId } : {}), ...(f.status ? { status: f.status as never } : {}), ...(f.q ? { customer: { fullName: contains(f.q) } } : {}) }, include: { customer: true, facility: true, items: true }, orderBy: { startsAt: "asc" } })).map((b) => ({ Reference: b.reference, Customer: b.customer.fullName, Email: b.customer.email, Facility: b.facility.name, Starts: d(b.startsAt), Ends: d(b.endsAt), Type: b.durationType, Items: b.items.length / b.days, Subtotal: b.subtotal, Discount: b.discount, Deposit: b.securityDeposit, Total: b.total, Status: b.status })),
  },
  utilisation: {
    title: "Machine utilisation report", perm: "equipment.manage", filters: ["facility", "category"],
    run: async (f) => {
      const eq = await db.equipment.findMany({ where: { ...(f.facilityId ? { facilityId: f.facilityId } : {}), ...(f.categoryId ? { categoryId: f.categoryId } : {}) }, include: { category: true, facility: true, bookingItems: { where: { active: true, startsAt: { gte: f.from, lte: f.to }, booking: { status: { in: ["CONFIRMED", "CHECKED_IN", "COMPLETED"] } } } }, serviceLogs: { where: { performedAt: { gte: f.from, lte: f.to } } } } });
      const days = Math.max(1, Math.round((f.to.getTime() - f.from.getTime()) / 86_400_000));
      return eq.map((e) => { const hrs = e.bookingItems.reduce((s, i) => s + (i.endsAt.getTime() - i.startsAt.getTime()) / 3_600_000, 0); const rev = e.bookingItems.reduce((s, i) => s + i.lineTotal, 0); const cost = e.serviceLogs.reduce((s, l) => s + l.cost, 0); return { "Asset tag": e.assetTag, Machine: e.name, Category: e.category.name, Facility: e.facility.name, Status: e.status, "Booked hours": Math.round(hrs * 10) / 10, "Utilisation %": Math.round((hrs / (days * 10)) * 1000) / 10, Revenue: rev, "Repair cost": cost, "Downtime hrs": e.serviceLogs.reduce((s, l) => s + l.downtimeHours, 0), Net: rev - cost }; });
    },
  },
  revenue: {
    title: "Revenue by service", perm: "finance.view", filters: [],
    run: async (f) => {
      const p = await db.payment.findMany({ where: { status: "SUCCEEDED", verifiedAt: { gte: f.from, lte: f.to } }, include: { invoice: true } });
      const r = await db.refund.findMany({ where: { createdAt: { gte: f.from, lte: f.to } }, include: { invoice: true } });
      const m = new Map<string, { gross: number; refunds: number; count: number }>();
      for (const x of p) { const k = x.invoice.purpose; const v = m.get(k) ?? { gross: 0, refunds: 0, count: 0 }; v.gross += x.amount; v.count++; m.set(k, v); }
      for (const x of r) { const k = x.invoice.purpose; const v = m.get(k) ?? { gross: 0, refunds: 0, count: 0 }; v.refunds += x.amount; m.set(k, v); }
      return [...m.entries()].map(([k, v]) => ({ Service: k, Payments: v.count, Gross: v.gross, Refunds: v.refunds, Net: v.gross - v.refunds }));
    },
  },
  tailors: {
    title: "Tailor registration report", perm: "tailors.review", filters: ["status", "q"],
    run: async (f) => (await db.tailorApplication.findMany({ where: { createdAt: { gte: f.from, lte: f.to }, ...(f.status ? { status: f.status as never } : {}), ...(f.q ? { fullName: contains(f.q) } : {}) }, orderBy: { createdAt: "asc" } })).map((a) => ({ Reference: a.reference, Name: a.fullName, Phone: a.phone, State: a.state, LGA: a.lga, "Years exp.": a.yearsExperience, Specialisations: a.specialisations.join("; "), Interests: a.interests.join("; "), Submitted: d(a.createdAt), Status: a.status })),
  },
  memberships: {
    title: "Active membership report", perm: "memberships.manage", filters: ["status"],
    run: async (f) => (await db.membership.findMany({ where: { status: (f.status as never) || "ACTIVE" }, include: { user: true, plan: true }, orderBy: { expiresAt: "asc" } })).map((m) => ({ Member: m.user.fullName, Email: m.user.email, Plan: m.plan.name, Fee: m.plan.fee, Started: d(m.startsAt), Expires: d(m.expiresAt), Status: m.status })),
  },
  orders: {
    title: "Bulk production order report", perm: "production.view", filters: ["status", "q"],
    run: async (f) => (await db.bulkOrder.findMany({ where: { createdAt: { gte: f.from, lte: f.to }, ...(f.status ? { status: f.status as never } : {}), ...(f.q ? { orgName: contains(f.q) } : {}) }, include: { items: true, quotations: { where: { status: "ACCEPTED" } }, invoices: true }, orderBy: { createdAt: "asc" } })).map((o) => ({ Reference: o.reference, Organisation: o.orgName, Type: o.orgType, Garments: o.items.map((i) => `${i.quantity}x ${i.garmentType}`).join("; "), Units: o.items.reduce((s, i) => s + i.quantity, 0), "Quoted total": o.quotations[0]?.total ?? null, Invoiced: o.invoices.reduce((s, i) => s + i.amount, 0), Paid: o.invoices.reduce((s, i) => s + i.amountPaid, 0), "Required by": d(o.requiredBy), Received: d(o.createdAt), Status: o.status })),
  },
  allocations: {
    title: "Production allocation report", perm: "production.view", filters: ["q"],
    run: async (f) => (await db.productionAllocation.findMany({ where: { createdAt: { gte: f.from, lte: f.to }, ...(f.q ? { job: { title: contains(f.q) } } : {}) }, include: { job: true, tailor: { include: { user: true } }, team: true } })).map((a) => ({ Job: a.job.reference, Title: a.job.title, Assignee: a.tailor ? `${a.tailor.code} ${a.tailor.user.fullName}` : a.team ? `Team ${a.team.name}` : a.partnerName, Quantity: a.quantity, Rate: a.rate, Due: d(a.dueDate), Status: a.status, Allocated: d(a.createdAt) })),
  },
  completion: {
    title: "Production completion report", perm: "production.view", filters: [],
    run: async (f) => (await db.productionJob.findMany({ where: { createdAt: { lte: f.to } }, include: { order: true, allocations: { include: { submissions: { include: { inspection: true } } } } } })).map((j) => { const subs = j.allocations.flatMap((a) => a.submissions); const acc = subs.reduce((s, x) => s + (x.inspection?.acceptedQty ?? 0), 0); return { Job: j.reference, Order: j.order?.reference ?? "", Title: j.title, Units: j.totalQuantity, Allocated: j.allocations.reduce((s, a) => s + a.quantity, 0), Submitted: subs.reduce((s, x) => s + x.quantity, 0), Accepted: acc, "Complete %": Math.round((acc / j.totalQuantity) * 100), Due: d(j.dueDate), Status: j.status }; }),
  },
  quality: {
    title: "Quality control report", perm: "production.qc", filters: [],
    run: async (f) => (await db.qualityInspection.findMany({ where: { inspectedAt: { gte: f.from, lte: f.to } }, include: { submission: { include: { allocation: { include: { job: true, tailor: { include: { user: true } }, team: true } } } } } })).map((q) => ({ Date: d(q.inspectedAt), Job: q.submission.allocation.job.reference, Assignee: q.submission.allocation.tailor?.user.fullName ?? q.submission.allocation.team?.name ?? q.submission.allocation.partnerName, Inspected: q.inspectedQty, Accepted: q.acceptedQty, Rework: q.reworkQty, Rejected: q.rejectedQty, "Pass %": Math.round((q.acceptedQty / Math.max(q.inspectedQty, 1)) * 100), Defects: q.defects.join("; "), Officer: q.officerId })),
  },
  earnings: {
    title: "Tailor piece-rate earnings report", perm: "production.view", filters: ["status", "q"],
    run: async (f) => (await db.pieceRateEarning.findMany({ where: { createdAt: { gte: f.from, lte: f.to }, ...(f.status ? { status: f.status as never } : {}), ...(f.q ? { tailor: { user: { fullName: contains(f.q) } } } : {}) }, include: { tailor: { include: { user: true } }, allocation: { include: { job: true, team: true } } } })).map((e) => ({ Date: d(e.createdAt), Tailor: e.tailor ? `${e.tailor.code} ${e.tailor.user.fullName}` : e.allocation.team?.name ?? e.allocation.partnerName, Job: e.allocation.job.reference, "Accepted pcs": e.quantity, Rate: e.rate, Amount: e.amount, Status: e.status, Approved: d(e.approvedAt), Paid: d(e.paidAt), "Payout ref": e.payoutRef })),
  },
  "academy-applications": {
    title: "Academy application report", perm: "academy.manage", filters: ["status", "q"],
    run: async (f) => (await db.studentApplication.findMany({ where: { createdAt: { gte: f.from, lte: f.to }, ...(f.status ? { status: f.status as never } : {}), ...(f.q ? { fullName: contains(f.q) } : {}) }, include: { session: { include: { course: true } } } })).map((a) => ({ Reference: a.reference, Name: a.fullName, Phone: a.phone, Course: a.session.course.title, Session: a.session.name, Submitted: d(a.createdAt), Status: a.status })),
  },
  enrolments: {
    title: "Student enrolment report", perm: "academy.manage", filters: [],
    run: async (f) => (await db.enrolment.findMany({ where: { createdAt: { gte: f.from, lte: f.to } }, include: { user: true, session: { include: { course: true } } } })).map((e) => ({ Student: e.user.fullName, Course: e.session.course.title, Session: e.session.name, Enrolled: d(e.createdAt), Status: e.status })),
  },
  performance: {
    title: "Student performance report", perm: "academy.manage", filters: [],
    run: async (f) => (await db.enrolment.findMany({ where: { createdAt: { lte: f.to } }, include: { user: true, session: { include: { course: true } }, attendance: true, assessments: true, certificate: true } })).map((e) => ({ Student: e.user.fullName, Course: e.session.course.title, Session: e.session.name, "Attendance %": e.attendance.length ? Math.round((e.attendance.filter((a) => a.status === "PRESENT" || a.status === "LATE").length / e.attendance.length) * 100) : null, Assessments: e.assessments.length, "Avg score %": e.assessments.length ? Math.round((e.assessments.reduce((s, a) => s + a.score / a.maxScore, 0) / e.assessments.length) * 100) : null, Final: e.finalScore, Certificate: e.certificate?.code ?? "", Status: e.status })),
  },
  transactions: {
    title: "Financial transaction report", perm: "finance.view", filters: ["status", "q"],
    run: async (f) => {
      const where: Prisma.PaymentWhereInput = { createdAt: { gte: f.from, lte: f.to }, ...(f.status ? { status: f.status as never } : {}), ...(f.q ? { OR: [{ reference: contains(f.q) }, { user: { fullName: contains(f.q) } }] } : {}) };
      return (await db.payment.findMany({ where, include: { invoice: true, user: true }, orderBy: { createdAt: "asc" } })).map((p) => ({ Created: d(p.createdAt), Verified: d(p.verifiedAt), Reference: p.reference, Provider: p.provider, Method: p.method, Payer: p.user.fullName, Invoice: p.invoice.number, Purpose: p.invoice.purpose, Amount: p.amount, Status: p.status }));
    },
  },
};

export function toCsv(rows: Row[]): string {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    let s = v == null ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // CSV/formula injection guard
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}

export async function toXlsx(title: string, rows: Row[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "StitchWorks Collective";
  const ws = wb.addWorksheet(title.slice(0, 31));
  const cols = rows.length ? Object.keys(rows[0]) : ["No data"];
  ws.columns = cols.map((c) => ({ header: c, key: c, width: Math.min(Math.max(c.length + 4, 12), 40) }));
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF4F0" } };
  for (const r of rows) ws.addRow(Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === "string" && /^[=+\-@]/.test(v) ? `'${v}` : v])));
  ws.views = [{ state: "frozen", ySplit: 1 }];
  return Buffer.from(await wb.xlsx.writeBuffer());
}
