import type { MetadataRoute } from "next";
import { appUrl } from "@/lib/app-url";

export default function robots(): MetadataRoute.Robots {
  const base = appUrl();
  return { rules: [{ userAgent: "*", allow: "/", disallow: ["/dashboard", "/admin", "/api", "/pay", "/login", "/register", "/reset-password", "/verify-email"] }], sitemap: `${base}/sitemap.xml` };
}
