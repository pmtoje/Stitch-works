import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { Alert, Field, Input, PageHeader, Panel } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { openSecret, totpQrDataUrl } from "@/lib/auth/totp";
import { changePasswordAction, confirmTotpAction, disableTotpAction, startTotpAction, updateProfileAction } from "../actions";

export default async function Security() {
  const me = await requireUser();
  const u = await db.user.findUniqueOrThrow({ where: { id: me.id } });
  const pendingSecret = u.totpSecretEnc && !u.totpEnabledAt ? openSecret(u.totpSecretEnc) : null;
  const qr = pendingSecret ? await totpQrDataUrl(u.email, pendingSecret) : null;
  return (
    <>
      <PageHeader title="Profile & security" />
      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Profile">
          <ActionForm action={updateProfileAction} className="space-y-4">
            <Field label="Full name"><Input name="fullName" defaultValue={u.fullName} required /></Field>
            <Field label="Email" hint={u.emailVerifiedAt ? "Verified" : "Not yet verified"}><Input value={u.email} disabled /></Field>
            <Field label="Phone"><Input name="phone" defaultValue={u.phone ?? ""} /></Field>
            <SubmitButton>Save</SubmitButton>
          </ActionForm>
        </Panel>
        <Panel title="Two-factor authentication">
          {u.totpEnabledAt ? (
            <ActionForm action={disableTotpAction} className="space-y-4">
              <Alert tone="success">Two-factor authentication is on. You’ll be asked for a code each time you sign in.</Alert>
              <Field label="Enter a current code to turn it off"><Input name="code" inputMode="numeric" required /></Field>
              <SubmitButton variant="secondary">Turn off 2FA</SubmitButton>
            </ActionForm>
          ) : pendingSecret ? (
            <ActionForm action={confirmTotpAction} className="space-y-4">
              <p className="text-sm text-charcoal-600">Scan this QR code with Google Authenticator, Microsoft Authenticator or similar, then enter the 6-digit code.</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {qr ? <img src={qr} alt="QR code for authenticator app" className="h-44 w-44 border border-charcoal-900/10" /> : null}
              <p className="font-mono text-xs text-stone-500 break-all">Manual key: {pendingSecret}</p>
              <Field label="Code"><Input name="code" inputMode="numeric" required /></Field>
              <SubmitButton>Confirm and turn on</SubmitButton>
            </ActionForm>
          ) : (
            <ActionForm action={startTotpAction} className="space-y-4">
              <p className="text-sm text-charcoal-600">Protect your account with a code from an authenticator app in addition to your password. Strongly recommended for management accounts.</p>
              <SubmitButton>Set up two-factor authentication</SubmitButton>
            </ActionForm>
          )}
        </Panel>
        <Panel title="Change password">
          <ActionForm action={changePasswordAction} className="space-y-4" resetOnSuccess>
            <Field label="Current password"><Input type="password" name="current" autoComplete="current-password" required /></Field>
            <Field label="New password" hint="10+ characters, letters and numbers."><Input type="password" name="password" autoComplete="new-password" required /></Field>
            <Field label="Confirm new password"><Input type="password" name="confirm" autoComplete="new-password" required /></Field>
            <SubmitButton>Change password</SubmitButton>
          </ActionForm>
        </Panel>
      </div>
    </>
  );
}
