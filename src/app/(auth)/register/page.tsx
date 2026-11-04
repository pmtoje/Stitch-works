import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Field, Input } from "@/components/ui";
import { registerAction } from "../actions";

export const metadata = { title: "Create an account" };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  return (
    <>
      <h1 className="text-4xl text-charcoal-900">Create your account</h1>
      <p className="mt-2 text-charcoal-600">Book equipment, request production, join the tailor network or apply to the Academy. Already registered? <Link className="link" href="/login">Sign in</Link>.</p>
      <ActionForm action={registerAction} className="mt-8 space-y-5">
        <input type="hidden" name="next" value={sp.next ?? ""} />
        <Field label="Full name" required><Input name="fullName" autoComplete="name" required /></Field>
        <Field label="Email address" required><Input type="email" name="email" autoComplete="email" required /></Field>
        <Field label="Phone number" hint="Used for booking reminders by SMS or WhatsApp."><Input type="tel" name="phone" autoComplete="tel" placeholder="+234 803 000 0000" /></Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Password" required hint="10+ characters, letters and numbers."><Input type="password" name="password" autoComplete="new-password" minLength={10} required /></Field>
          <Field label="Confirm password" required><Input type="password" name="confirm" autoComplete="new-password" required /></Field>
        </div>
        <p className="text-xs text-stone-500">By creating an account you agree to our <Link href="/policies/terms" className="link">terms</Link> and <Link href="/policies/privacy" className="link">privacy policy</Link>.</p>
        <SubmitButton pendingText="Creating account…">Create account</SubmitButton>
      </ActionForm>
    </>
  );
}
