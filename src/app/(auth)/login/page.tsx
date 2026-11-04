import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Alert, Field, Input } from "@/components/ui";
import { loginAction } from "../actions";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  return (
    <>
      <h1 className="text-4xl text-charcoal-900">Sign in</h1>
      <p className="mt-2 text-charcoal-600">Welcome back. New to StitchWorks? <Link className="link" href={`/register${sp.next ? `?next=${encodeURIComponent(sp.next)}` : ""}`}>Create an account</Link>.</p>
      <div className="mt-8 space-y-4">
        {sp.reset ? <Alert tone="success">Your password has been updated. Please sign in.</Alert> : null}
        <ActionForm action={loginAction} className="space-y-5">
          <input type="hidden" name="next" value={sp.next ?? ""} />
          <Field label="Email address"><Input type="email" name="email" autoComplete="email" required /></Field>
          <Field label="Password"><Input type="password" name="password" autoComplete="current-password" required /></Field>
          <div className="flex items-center justify-between">
            <Link href="/forgot-password" className="text-sm text-forest-700 hover:underline">Forgot password?</Link>
            <SubmitButton pendingText="Signing in…">Sign in</SubmitButton>
          </div>
        </ActionForm>
      </div>
    </>
  );
}
