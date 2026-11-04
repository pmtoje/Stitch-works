"use client";
import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/lib/action";
import { Alert, buttonClass } from "./index";

export function SubmitButton({ children, pendingText, variant = "primary", size = "md", className, name, value }: { children: ReactNode; pendingText?: string; variant?: Parameters<typeof buttonClass>[0]; size?: Parameters<typeof buttonClass>[1]; className?: string; name?: string; value?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" name={name} value={value} disabled={pending} aria-busy={pending} className={buttonClass(variant, size, className)}>
      {pending ? (
        <>
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden />
          {pendingText ?? "Working…"}
        </>
      ) : (
        children
      )}
    </button>
  );
}

export function ActionForm({
  action,
  children,
  className,
  successMessage,
  resetOnSuccess,
  confirm,
}: {
  action: (state: ActionState, fd: FormData) => Promise<ActionState>;
  children: ReactNode;
  className?: string;
  successMessage?: string;
  resetOnSuccess?: boolean;
  confirm?: string;
}) {
  const [state, formAction] = useActionState(action, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok && resetOnSuccess) ref.current?.reset();
    if (state.error) ref.current?.querySelector<HTMLElement>("[role=alert]")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [state, resetOnSuccess]);
  return (
    <form
      ref={ref}
      action={formAction}
      className={className}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {state.error ? (
        <div className="mb-4">
          <Alert tone="error">{state.error}</Alert>
        </div>
      ) : null}
      {state.ok && (state.message || successMessage) ? (
        <div className="mb-4">
          <Alert tone="success">{state.message ?? successMessage}</Alert>
        </div>
      ) : null}
      {children}
    </form>
  );
}
