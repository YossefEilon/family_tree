import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PwaProvider } from "./pwa-provider";
import { PWA_THEME_COLOR } from "@/lib/pwa";

export const metadata: Metadata = {
  title: "עץ משפחה - אילון",
  description: "עץ משפחה דיגיטלי, נגיש ומאובטח",
  applicationName: "עץ משפחה",
  appleWebApp: { capable: true, title: "עץ משפחה", statusBarStyle: "default" },
  formatDetection: { telephone: false },
  icons: {
    icon: [{ url: "/pwa-icon/192", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/pwa-icon/maskable-192", sizes: "192x192", type: "image/png" }],
  },
  other: { "mobile-web-app-capable": "yes" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: PWA_THEME_COLOR,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="he" dir="rtl"><body>{children}<PwaProvider /></body></html>;
}
