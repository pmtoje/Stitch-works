import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Field, Input } from "@/components/ui";
import { mfaAction } from "../../actions";

export const metadata = { title: "Two-factor verification" };

export default async function MfaPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  return (
    <>
      <h1 className="text-4xl text-charcoal-900">Two-step verification</h1>
      <p className="mt-2 text-charcoal-600">Enter the 6-digit code from your authenticator app.</p>
      <ActionForm action={mfaAction} className="mt-8 space-y-5">
        <input type="hidden" name="next" value={sp.next ?? "/dashboard"} />
        <Field label="Authentication code"><Input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" required autoFocus /></Field>
        <SubmitButton>Verify</SubmitButton>
      </ActionForm>
    </>
  );
}
