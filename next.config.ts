import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ── Security Headers (Phase 1 Improvement) ──────────────────────────
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // Prevent MIME-type sniffing
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Prevent clickjacking
          { key: "X-Frame-Options", value: "DENY" },
          // Referrer policy: send only origin on cross-origin
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Permissions policy: restrict browser features
          {
            key: "Permissions-Policy",
            value:
              "camera=(), microphone=(), geolocation=(), " +
              "payment=(), usb=(), magnetometer=(), gyroscope=()",
          },
          // Content Security Policy
          // Allows: self, Google APIs (server-side not in CSP),
          // base64 images (data:), and the required Tailwind/dynamic styles
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https:",
              "font-src 'self'",
              "connect-src 'self' https://api.fonnte.com",
              "frame-src 'none'",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
          // HSTS (HTTP Strict Transport Security) — only on HTTPS
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },

  // ── Additional Security Config ──────────────────────────────────────
  // Prevent Next.js from exposing X-Powered-By header
  poweredByHeader: false,
};

export default nextConfig;