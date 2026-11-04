import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Field, Input } from "@/components/ui";
import { forgotAction } from "../actions";

export const metadata = { title: "Reset your password" };

export default function ForgotPage() {
  return (
    <>
      <h1 className="text-4xl text-charcoal-900">Forgot your password?</h1>
      <p className="mt-2 text-charcoal-600">Enter your email and we’ll send you a secure reset link.</p>
      <ActionForm action={forgotAction} className="mt-8 space-y-5">
        <Field label="Email address"><Input type="email" name="email" required /></Field>
        <SubmitButton>Send reset link</SubmitButton>
      </ActionForm>
    </>
  );
}
