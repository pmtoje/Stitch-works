import { Alert, LinkButton } from "@/components/ui";
import { publicMessage } from "@/lib/errors";
import { verifyEmailToken } from "../actions";

export const metadata = { title: "Verify email" };

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const { token } = await searchParams;
  let error: string | null = null;
  try {
    if (!token) throw new Error("missing");
    await verifyEmailToken(token);
  } catch (e) {
    error = token ? publicMessage(e) : "This verification link is incomplete.";
  }
  return (
    <>
      <h1 className="text-4xl text-charcoal-900">{error ? "Verification failed" : "Email verified"}</h1>
      <div className="mt-6">{error ? <Alert tone="error">{error}</Alert> : <Alert tone="success">Thank you — your email address is confirmed.</Alert>}</div>
      <div className="mt-6"><LinkButton href="/dashboard">Go to my dashboard</LinkButton></div>
    </>
  );
}
