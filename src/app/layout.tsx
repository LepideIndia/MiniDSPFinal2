import type { Metadata } from "next";
import { Open_Sans, Sora } from "next/font/google";
import "./globals.css";

const openSans = Open_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-open-sans",
  display: "swap",
});
const sora = Sora({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-sora",
  display: "swap",
});

export const metadata: Metadata = {
  title: "MiniDSP",
  description: "Training-only data discovery and classification (synthetic data only)",
};

// Hosted, version-stable Lepidus stylesheet (tokens + lp- components). See DESIGN_REFERENCE.md.
const LEPIDUS_CSS = "https://lepidus-design-system-button.vercel.app/v1/lepidus.css";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light" className={`fonts ${openSans.variable} ${sora.variable}`}>
      <head>
        <link rel="stylesheet" href={LEPIDUS_CSS} />
      </head>
      <body>{children}</body>
    </html>
  );
}
