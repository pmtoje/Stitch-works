import type { EnquiryCategory } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { Checkbox, PageHeader, Select, StatusBadge, Textarea } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { SearchBar } from "@/components/dash/search";
import { fmtDateTime, humanize } from "@/lib/format";
import { enquiryAdminAction } from "../actions";

export default async function Enquiries({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  await requirePermission("enquiries.manage");
  const list = await db.enquiry.findMany({ where: { ...(sp.status ? { category: sp.status as EnquiryCategory } : {}), ...(sp.q ? { OR: [{ name: { contains: sp.q, mode: "insensitive" } }, { email: { contains: sp.q, mode: "insensitive" } }, { message: { contains: sp.q, mode: "insensitive" } }] } : {}) }, orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 200 });
  return (
    <>
      <PageHeader title="Enquiries" description="Every contact-form and business enquiry, categorised." />
      <SearchBar q={sp.q} status={sp.status} statuses={["WORKSPACE_BOOKING", "BULK_PRODUCTION", "TAILOR_REGISTRATION", "ACADEMY", "PARTNERSHIP", "GENERAL"]} />
      <div className="space-y-3">
        {list.map((e) => (
          <details key={e.id} className="border border-charcoal-900/10 bg-white" open={e.status === "NEW"}>
            <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 px-4 py-3"><span><span className="font-mono text-xs text-stone-500">{e.reference}</span> · <strong>{e.name}</strong> · {humanize(e.category)}</span><span className="flex items-center gap-2 text-xs text-stone-500">{fmtDateTime(e.createdAt)} <StatusBadge status={e.status} /></span></summary>
            <div className="border-t border-charcoal-900/10 px-4 py-4">
              <p className="text-sm text-stone-600">{e.email}{e.phone ? ` · ${e.phone}` : ""}{e.company ? ` · ${e.company}` : ""}</p>
              <p className="mt-2 whitespace-pre-line">{e.message}</p>
              <ActionForm action={enquiryAdminAction} className="mt-4 space-y-2">
                <input type="hidden" name="id" value={e.id} />
                <Textarea name="response" rows={3} defaultValue={e.response ?? ""} placeholder="Reply / internal notes" />
                <div className="flex flex-wrap items-center gap-3"><Select name="status" defaultValue={e.status} className="w-40 py-1.5"><option>NEW</option><option>IN_PROGRESS</option><option>RESOLVED</option></Select><Checkbox name="send" label="Email the reply to the sender" /><SubmitButton size="sm">Save</SubmitButton></div>
              </ActionForm>
            </div>
          </details>
        ))}
        {!list.length ? <p className="text-sm text-stone-500">No enquiries.</p> : null}
      </div>
    </>
  );
}
