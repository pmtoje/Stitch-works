"use client";
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (<main id="main" className="container flex min-h-[60vh] flex-col items-start justify-center py-24"><p className="eyebrow">Something went wrong</p><h1 className="mt-4 text-4xl">We couldn’t load this page.</h1><p className="mt-3 text-charcoal-600">Please try again. If the problem continues, contact StitchWorks support.</p><button onClick={reset} className="mt-6 bg-forest-700 px-5 py-2.5 text-cream-50">Try again</button></main>);
}
