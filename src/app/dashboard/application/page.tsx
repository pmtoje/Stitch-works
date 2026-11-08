import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { DL, EmptyState, LinkButton, PageHeader, Panel, StatusBadge } from "@/components/ui";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { TAILOR_FLOW } from "@/lib/tailors/service";

const STEPS = ["SUBMITTED", "UNDER_REVIEW", "SHORTLISTED", "ASSESSMENT_SCHEDULED", "APPROVED", "ONBOARDING", "ACTIVE"];

export default async function MyApplication() {
  const u = await requireUser();
  const apps = await db.tailorApplication.findMany({ where: { userId: u.id }, orderBy: { createdAt: "desc" } });
  void TAILOR_FLOW;
  if (!apps.length) return (<><PageHeader title="Tailor application" /><EmptyState title="You haven’t applied yet" body="Join the StitchWorks tailor network for equipment access, production contracts and growth opportunities." action={<LinkButton href="/tailors#apply">Apply now</LinkButton>} /></>);
  return (
    <>
      <PageHeader title="Tailor application" />
      {apps.map((a) => (
        <Panel key={a.id} title={`Application ${a.reference}`} actions={<StatusBadge status={a.status} />} className="mb-6">
          {a.status !== "REJECTED" ? (
            <ol className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
              {STEPS.map((s, i) => {
                const done = STEPS.indexOf(a.status) >= i;
                return <li key={s} className={`border-t-4 pt-2 text-xs ${done ? "border-forest-600 text-charcoal-900" : "border-charcoal-900/10 text-stone-400"}`}>{s.replace(/_/g, " ").toLowerCase()}</li>;
              })}
            </ol>
          ) : null}
          <DL items={[["Submitted", fmtDate(a.createdAt)], ["Specialisations", a.specialisations.join(", ")], ["Interested in", a.interests.map((i) => i.replace(/_/g, " ").toLowerCase()).join(", ")], ...(a.assessmentAt ? [["Assessment", fmtDateTime(a.assessmentAt)] as [string, string]] : [])]} />
        </Panel>
      ))}
    </>
  );
}
