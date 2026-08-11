import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "שורשים | עץ משפחה",
  description: "עץ משפחה דיגיטלי, נגיש ומאובטח",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="he" dir="rtl"><body>{children}</body></html>;
}
