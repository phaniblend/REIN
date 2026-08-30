import type { Metadata, Viewport } from "next";
import { Outfit, Space_Grotesk } from "next/font/google";
import { QueryProvider } from "@/components/providers";
import "./globals.css";

const body = Outfit({
  variable: "--font-body",
  subsets: ["latin"],
});

const display = Space_Grotesk({
  variable: "--font-display",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Restman",
  description:
    "Restaurant manager for inventory, ROI, and yield-loss — Actual vs Theoretical.",
  applicationName: "Restman",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Restman",
  },
};

export const viewport: Viewport = {
  themeColor: "#264735",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${body.variable} ${display.variable} h-full`}>
      <body className="min-h-full antialiased">
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
