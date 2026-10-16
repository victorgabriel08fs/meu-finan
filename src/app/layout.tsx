import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import { Providers } from "@/components/providers";
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
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F4F5F7" },
    { media: "(prefers-color-scheme: dark)", color: "#0B0D10" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // next-themes and the privacy script set attributes on <html> before hydration.
    <html lang="pt-BR" className={manrope.variable} suppressHydrationWarning>
      <body className="bg-bg font-sans text-fg antialiased">
        <script
          // biome-ignore lint/security/noDangerouslySetInnerHtml: constant boot script, no user input
          dangerouslySetInnerHTML={{ __html: PRIVACY_BOOT_SCRIPT }}
        />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
