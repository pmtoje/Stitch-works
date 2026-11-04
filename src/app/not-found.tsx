import Link from "next/link";
export default function NotFound() {
  return (<main id="main" className="container flex min-h-[70vh] flex-col items-start justify-center py-24"><p className="eyebrow">404</p><h1 className="mt-4 text-5xl">This page has come unstitched.</h1><p className="mt-3 text-charcoal-600">The page you were looking for doesn’t exist or you don’t have access to it.</p><Link href="/" className="link mt-6">Return home</Link></main>);
}
