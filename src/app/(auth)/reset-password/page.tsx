import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Field, Input } from "@/components/ui";
import { resetAction } from "../actions";

export const metadata = { title: "Choose a new password" };

export default async function ResetPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const { token = "" } = await searchParams;
  return (
    <>
      <h1 className="text-4xl text-charcoal-900">Choose a password</h1>
      <p className="mt-2 text-charcoal-600">For security, you’ll be signed out of other devices.</p>
      <ActionForm action={resetAction} className="mt-8 space-y-5">
        <input type="hidden" name="token" value={token} />
        <Field label="New password" hint="10+ characters, letters and numbers."><Input type="password" name="password" autoComplete="new-password" required /></Field>
        <Field label="Confirm password"><Input type="password" name="confirm" autoComplete="new-password" required /></Field>
        <SubmitButton>Save password</SubmitButton>
      </ActionForm>
    </>
  );
}
