import { redirect } from "next/navigation";
import { Eyebrow, Field, Input, Button } from "@/components/ui";

export const metadata = { title: "Verify a StitchWorks Academy Certificate" };

export default function VerifyPage() {
  async function go(fd: FormData) {
    "use server";
    const code = String(fd.get("code") ?? "").trim().toUpperCase().replace(/[^A-Z0-9-]/g, "");
    if (code) redirect(`/verify/${code}`);
  }
  return (
    <section className="container max-w-xl py-24">
      <Eyebrow>Certificate verification</Eyebrow>
      <h1 className="mt-4 text-5xl">Verify a certificate</h1>
      <p className="mt-3 text-charcoal-600">Enter the verification ID printed on a StitchWorks Academy certificate, e.g. SWA-2026-7KQ4-M2XD.</p>
      <form action={go} className="mt-8 flex gap-2"><Field label="Verification ID" className="flex-1"><Input name="code" required autoCapitalize="characters" /></Field><Button className="mt-[26px]">Verify</Button></form>
    </section>
  );
}
