import { verifyCertificate } from "@/lib/academy/service";
import { Alert, Eyebrow, LinkButton } from "@/components/ui";
import { Mark } from "@/components/site/logo";
import { PrintButton } from "@/components/ui/print-button";
import { fmtDate } from "@/lib/format";
import { rateLimit } from "@/lib/ratelimit";
import { clientIp } from "@/lib/auth/session";

export const metadata = { title: "Certificate verification", robots: { index: false } };

export default async function VerifyCode({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!(await rateLimit(`verify:${await clientIp()}`, 60, 600))) return <div className="container max-w-xl py-24"><Alert tone="error">Too many lookups. Please try again shortly.</Alert></div>;
  const c = await verifyCertificate(decodeURIComponent(code));
  if (!c) return (<section className="container max-w-xl py-24"><Eyebrow>Certificate verification</Eyebrow><h1 className="mt-4 text-4xl">No certificate found</h1><div className="mt-6"><Alert tone="error">No StitchWorks Academy certificate matches “{decodeURIComponent(code)}”. Check the ID and try again.</Alert></div><LinkButton href="/verify" variant="secondary" className="mt-6">Try another ID</LinkButton></section>);
  return (
    <section className="container max-w-3xl py-16">
      <div className="no-print mb-6">{c.revoked ? <Alert tone="error">This certificate has been revoked and is no longer valid.</Alert> : <Alert tone="success">Valid certificate — issued by StitchWorks Academy.</Alert>}</div>
      <div className="relative border-[10px] border-double border-forest-700 bg-cream-50 p-10 text-center md:p-16">
        <Mark className="mx-auto h-12 w-12 text-forest-700" />
        <p className="mt-4 eyebrow">StitchWorks Academy</p>
        <p className="mt-8 text-sm uppercase tracking-[0.3em] text-stone-500">Certificate of completion</p>
        <p className="mt-6 text-stone-600">This certifies that</p>
        <p className="mt-2 font-display text-4xl md:text-5xl">{c.holderName}</p>
        <p className="mt-6 text-stone-600">has successfully completed</p>
        <p className="mt-2 font-display text-2xl text-forest-700 md:text-3xl">{c.courseTitle}</p>
        {c.grade ? <p className="mt-3 text-sm">with <strong>{c.grade}</strong></p> : null}
        <div className="mt-10 flex flex-wrap justify-between gap-4 border-t border-charcoal-900/10 pt-6 text-left text-xs text-stone-600">
          <span>Issued {fmtDate(c.issuedAt)}</span>
          <span className="font-mono">Verification ID: {c.code}</span>
        </div>
      </div>
      <div className="no-print mt-6"><PrintButton label="Print / download certificate" /></div>
    </section>
  );
}
