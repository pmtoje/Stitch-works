import { getCurrentUser } from "@/lib/auth/session";
import { Eyebrow, LinkButton } from "@/components/ui";

export const metadata = { title: "Request received", robots: { index: false } };

export default async function Submitted({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const { ref } = await searchParams;
  const user = await getCurrentUser();
  return (
    <section className="container max-w-2xl py-24">
      <Eyebrow>Production request received</Eyebrow>
      <h1 className="mt-4 text-5xl">Thank you.</h1>
      <p className="mt-4 text-lg text-charcoal-600">Your reference is <strong className="font-mono text-charcoal-900">{ref}</strong>. Our production team will review your request and send a quotation, usually within two working days.</p>
      {!user ? <p className="mt-4 text-charcoal-600">We’ve emailed you a link to set a password for your new StitchWorks account, where you can review the quotation and track production.</p> : null}
      <div className="mt-8 flex gap-3">{user ? <LinkButton href="/dashboard/orders">Track my order</LinkButton> : <LinkButton href="/login">Sign in</LinkButton>}<LinkButton href="/" variant="secondary">Back to home</LinkButton></div>
    </section>
  );
}
