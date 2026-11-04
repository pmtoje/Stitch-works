import { Logo } from "@/components/site/logo";
import { ImageSlot } from "@/components/ui/image-slot";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.1fr]">
      <div className="relative hidden bg-forest-900 lg:block">
        <ImageSlot slot="auth-panel" brief="Hands guiding fabric under an industrial presser foot" tone="forest" />
        <div className="absolute inset-0 bg-gradient-to-t from-forest-950/90 to-transparent" />
        <div className="absolute bottom-0 p-12 text-cream-50">
          <p className="eyebrow-light">StitchWorks Collective</p>
          <p className="mt-4 max-w-md font-display text-4xl leading-tight">One account for bookings, production, membership and the Academy.</p>
        </div>
      </div>
      <main id="main" className="flex flex-col px-5 py-8 sm:px-10">
        <Logo />
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-12">{children}</div>
      </main>
    </div>
  );
}
