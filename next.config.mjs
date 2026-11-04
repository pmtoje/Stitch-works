/** @type {import('next').NextConfig} */
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'"} https://js.paystack.co https://www.googletagmanager.com`,
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob: https://www.google-analytics.com",
      "frame-src https://checkout.paystack.com https://www.google.com",
      "connect-src 'self' https://api.paystack.co https://www.google-analytics.com",
      "form-action 'self' https://checkout.paystack.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
    ].join("; "),
  },
];

const nextConfig = {
  poweredByHeader: false,
  experimental: { serverActions: { bodySizeLimit: "30mb" } },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};
export default nextConfig;
