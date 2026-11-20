import { Analytics } from "@vercel/analytics/next";
import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import { Providers } from "@/components/providers";
import { SPLASH_SIZES, splashMedia, splashPath } from "@/lib/brand/splash";
import {
  DEFAULT_THEME,
  THEME_COLORS,
  THEME_HEAD_SCRIPT,
  THEME_META_SCRIPT,
} from "@/lib/theme";
import { appOrigin } from "@/server/env";
import { PRIVACY_BOOT_SCRIPT } from "@/stores/privacy-boot";
import "./globals.css";

// Variable font (200–800) with tabular figures; self-hosted by next/font.
const manrope = Manrope({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-manrope",
});

export const metadata: Metadata = {
  metadataBase: new URL(appOrigin()),
  title: { template: "%s · Prumo", default: "Prumo" },
  description: "Controle financeiro pessoal",
  applicationName: "Prumo",
  appleWebApp: {
    capable: true,
    title: "Prumo",
    statusBarStyle: "default",
    startupImage: SPLASH_SIZES.map((size) => ({
      url: splashPath(size),
      media: splashMedia(size),
    })),
  },
  openGraph: {
    siteName: "Prumo",
    locale: "pt_BR",
    type: "website",
  },
  formatDetection: { telephone: false },
  // O Next emite só mobile-web-app-capable; o iOS ainda pede a meta da Apple
  // para usar as apple-touch-startup-image do app instalado.
  other: { "apple-mobile-web-app-capable": "yes" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  // Dark by default (doc 02 §3.11): the canvas before the styles load and the
  // status bar start dark; THEME_META_SCRIPT and ThemeMetaSync (in Providers)
  // point both at the saved theme.
  colorScheme: DEFAULT_THEME,
  themeColor: THEME_COLORS[DEFAULT_THEME],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // Rendered dark, the default, so a first visit (or a page whose scripts
    // cannot read storage) is dark with no script at all. The theme scripts,
    // next-themes and the privacy script set attributes on <html> before
    // hydration.
    <html
      lang="pt-BR"
      data-theme={DEFAULT_THEME}
      className={manrope.variable}
      suppressHydrationWarning
    >
      <head>
        <script
          // biome-ignore lint/security/noDangerouslySetInnerHtml: constant boot script, no user input
          dangerouslySetInnerHTML={{ __html: THEME_HEAD_SCRIPT }}
        />
      </head>
      <body className="bg-bg font-sans text-fg antialiased">
        <script
          // biome-ignore lint/security/noDangerouslySetInnerHtml: constant boot script, no user input
          dangerouslySetInnerHTML={{ __html: PRIVACY_BOOT_SCRIPT }}
        />
        <script
          // biome-ignore lint/security/noDangerouslySetInnerHtml: constant boot script, no user input
          dangerouslySetInnerHTML={{ __html: THEME_META_SCRIPT }}
        />
        <Providers>{children}</Providers>
        {/* Only Vercel serves /_vercel/insights: a local `next start` would 404. */}
        {process.env.VERCEL === "1" && <Analytics />}
      </body>
    </html>
  );
}
