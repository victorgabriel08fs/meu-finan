import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";
// Vercel serves every deployment over HTTPS. A local `next start` runs on plain
// HTTP, where upgrade-insecure-requests would rewrite asset URLs to https://.
const isVercel = process.env.VERCEL === "1";

/**
 * Content-Security-Policy without nonces.
 *
 * Nonces need every response rendered per request, and the Next.js CSP guide
 * notes they are incompatible with the prerendered static shell that Cache
 * Components (PPR) serves. So script-src and style-src keep 'unsafe-inline':
 * Next streams the RSC payload in inline <script> tags, next-themes sets the
 * theme with an inline script, and Radix, Motion and Sonner write inline styles.
 * Everything else is locked to this origin, which also limits what an injected
 * script could exfiltrate (no third-party connect, img, form or frame targets).
 *
 * Path to a nonce-based CSP: generate the nonce in src/proxy.ts and send it on
 * the request and response CSP headers (see the bundled guide
 * 02-guides/content-security-policy.md), then render every route at request
 * time. That drops the static shell and instant navigations, so it only pays
 * off if the app stops relying on prerendering.
 *
 * WebAuthn is not governed by CSP (its Permissions-Policy default is 'self'),
 * and next/font serves the font files from /_next/static, covered by
 * font-src 'self'. A new third-party origin (Sentry, Vercel Blob uploads) must
 * be added to the matching directive.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  // 'unsafe-eval' only in development: React rebuilds server error stacks with eval.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  // Development also needs the HMR WebSocket.
  `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isVercel ? ["upgrade-insecure-requests"] : []),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  // Skipped in development so `next dev --experimental-https` does not pin localhost to HTTPS.
  ...(isDev
    ? []
    : [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
      ]),
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
];

/**
 * Opening `next dev` from a phone on the same network: BETTER_AUTH_URL points
 * at the computer's address (README, "No celular"), and the dev server must
 * accept requests from that hostname too. Next loads .env files before this
 * file, so the value is already here.
 */
function lanDevOrigins(): string[] {
  try {
    const { hostname } = new URL(process.env.BETTER_AUTH_URL ?? "");
    return hostname === "localhost" || hostname === "127.0.0.1"
      ? []
      : [hostname];
  } catch {
    return [];
  }
}

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  allowedDevOrigins: lanDevOrigins(),
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  poweredByHeader: false,
  // Embedded Postgres for local development: loaded from node_modules at runtime.
  serverExternalPackages: ["@electric-sql/pglite"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
