import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import { Providers } from "@/components/providers";
import { DEFAULT_THEME, THEME_BOOT_SCRIPT, THEME_COLORS } from "@/lib/theme";
import { PRIVACY_BOOT_SCRIPT } from "@/stores/privacy-boot";
import "./globals.css";

// Variable font (200–800) with tabular figures; self-hosted by next/font.
const manrope = Manrope({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-manrope",
});

export const metadata: Metadata = {
  title: { template: "%s · Meu Finan", default: "Meu Finan" },
  description: "Controle financeiro pessoal",
  applicationName: "Meu Finan",
  appleWebApp: {
    capable: true,
    title: "Meu Finan",
    statusBarStyle: "default",
  },
  formatDetection: { telephone: false },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  // Dark by default (doc 02 §3.11): the canvas before the styles load and the
  // status bar start dark; the theme boot script and ThemeMetaSync (in
  // Providers) point both at the saved theme.
  colorScheme: DEFAULT_THEME,
  themeColor: THEME_COLORS[DEFAULT_THEME],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // Rendered dark, the default, so a page whose script could not run (no
    // storage) is still dark. next-themes, the theme boot script and the
    // privacy script set attributes on <html> before hydration.
    <html
      lang="pt-BR"
      data-theme={DEFAULT_THEME}
      className={manrope.variable}
      suppressHydrationWarning
    >
      <body className="bg-bg font-sans text-fg antialiased">
        <script
          // biome-ignore lint/security/noDangerouslySetInnerHtml: constant boot script, no user input
          dangerouslySetInnerHTML={{ __html: PRIVACY_BOOT_SCRIPT }}
        />
        <script
          // biome-ignore lint/security/noDangerouslySetInnerHtml: constant boot script, no user input
          dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }}
        />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
