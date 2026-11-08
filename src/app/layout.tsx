import type { Metadata, Viewport } from "next";
import "@fontsource-variable/fraunces";
import "@fontsource-variable/inter-tight";
import "./globals.css";
import { appUrl } from "@/lib/app-url";

const site = appUrl();

export const metadata: Metadata = {
  metadataBase: new URL(site),
  title: { default: "StitchWorks Collective — Garment Production, Workspace & Academy in Jos, Nigeria", template: "%s · StitchWorks Collective" },
  description:
    "StitchWorks Collective is a garment production ecosystem in Jos, Nigeria: industrial sewing machine and workspace rental, bulk uniform manufacturing, a professional tailor network and StitchWorks Academy.",
  keywords: ["garment production Nigeria", "bulk uniform production Nigeria", "tailoring services Jos", "sewing machine rental", "tailoring workspace rental", "fashion training Jos", "tailoring academy Nigeria", "corporate uniform manufacturing"],
  openGraph: { type: "website", siteName: "StitchWorks Collective", locale: "en_NG" },
  twitter: { card: "summary_large_image" },
  verification: process.env.GOOGLE_SITE_VERIFICATION ? { google: process.env.GOOGLE_SITE_VERIFICATION } : undefined,
};

export const viewport: Viewport = { themeColor: "#173d2b", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const ga = process.env.NEXT_PUBLIC_GA_ID;
  return (
    <html lang="en-NG">
      <body className="min-h-screen">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:bg-forest-700 focus:px-4 focus:py-2 focus:text-white">
          Skip to content
        </a>
        {children}
        {ga ? (
          <>
            <script async src={`https://www.googletagmanager.com/gtag/js?id=${ga}`} />
            <script dangerouslySetInnerHTML={{ __html: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${ga.replace(/[^A-Z0-9-]/gi, "")}');` }} />
          </>
        ) : null}
      </body>
    </html>
  );
}
