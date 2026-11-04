import Link from "next/link";
import { getContent } from "@/lib/cms";
import { Logo } from "./logo";

const cols = [
  { title: "StitchWorks Production", links: [["Book a workspace", "/book"], ["Machine rental", "/services#machines"], ["Bulk production", "/bulk-production"], ["Request a quote", "/bulk-production#request"], ["Track an order", "/dashboard/orders"]] },
  { title: "Tailor Network", links: [["Become a tailor", "/tailors"], ["Membership plans", "/memberships"], ["Production marketplace", "/tailors#marketplace"], ["Tailor dashboard", "/dashboard/tailor"]] },
  { title: "StitchWorks Academy", links: [["All programmes", "/academy"], ["How to apply", "/academy#apply"], ["Verify a certificate", "/verify"], ["Student portal", "/dashboard/academy"]] },
  { title: "Company", links: [["About us", "/about"], ["Our services", "/services"], ["Journal", "/blog"], ["FAQs", "/faq"], ["Contact", "/contact"]] },
];

export async function SiteFooter() {
  const contact = await getContent("contact");
  return (
    <footer className="bg-charcoal-900 text-cream-200">
      <div className="container py-16">
        <div className="grid gap-12 lg:grid-cols-[1.2fr_2fr]">
          <div>
            <Logo light />
            <p className="mt-6 max-w-sm text-sm leading-relaxed text-cream-200/70">
              A Common Facility Centre for garment production — shared industrial equipment, professional workspace, a network of skilled tailors and practical training, under one roof.
            </p>
            <address className="mt-6 space-y-1 text-sm not-italic text-cream-200/80">
              <p>{contact.address}</p>
              {contact.phone ? <p><a className="hover:text-ochre-300" href={`tel:${contact.phone.replace(/\s/g, "")}`}>{contact.phone}</a></p> : null}
              {contact.email ? <p><a className="hover:text-ochre-300" href={`mailto:${contact.email}`}>{contact.email}</a></p> : null}
              <p className="text-cream-200/60">{contact.hours}</p>
            </address>
          </div>
          <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
            {cols.map((c) => (
              <div key={c.title}>
                <p className="text-[11px] font-semibold uppercase tracking-eyebrow text-ochre-300">{c.title}</p>
                <ul className="mt-4 space-y-2.5 text-sm">
                  {c.links.map(([label, href]) => (
                    <li key={href}><Link className="text-cream-200/80 hover:text-cream-50" href={href}>{label}</Link></li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
        <div className="stitch-rule mt-14 text-cream-200/30" />
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 text-xs text-cream-200/60">
          <p>© {new Date().getFullYear()} StitchWorks Collective. Jos, Plateau State, Nigeria.</p>
          <ul className="flex flex-wrap gap-5">
            <li><Link href="/policies/terms" className="hover:text-cream-50">Terms</Link></li>
            <li><Link href="/policies/privacy" className="hover:text-cream-50">Privacy</Link></li>
            <li><Link href="/policies/booking" className="hover:text-cream-50">Booking &amp; cancellation</Link></li>
            <li><Link href="/policies/refunds" className="hover:text-cream-50">Refunds</Link></li>
          </ul>
        </div>
      </div>
    </footer>
  );
}

export async function WhatsAppButton() {
  const c = await getContent("contact");
  if (!c.whatsapp) return null;
  const num = c.whatsapp.replace(/\D/g, "");
  return (
    <a href={`https://wa.me/${num}?text=${encodeURIComponent("Hello StitchWorks, I'd like to make an enquiry.")}`} target="_blank" rel="noopener noreferrer" className="no-print fixed bottom-5 right-5 z-40 flex h-12 items-center gap-2 bg-forest-700 px-4 text-sm font-medium text-cream-50 shadow-lg hover:bg-forest-800" aria-label="Chat with StitchWorks on WhatsApp">
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3a.5.5 0 0 0 0-.5l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.8-1.3 2.2 2.2 0 0 0 .2-1.3c-.1-.1-.3-.2-.5-.3Z"/></svg>
      WhatsApp
    </a>
  );
}
