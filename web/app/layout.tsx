import type { Metadata, Viewport } from "next";
import { Lora } from "next/font/google";
import { connection } from "next/server";
import "./globals.css";

const lora = Lora({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "box fraise",
  description: "A platform for local commerce, cooperative ownership, and decentralised infrastructure.",
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Opts every page into dynamic rendering so Next.js reads the per-request
  // CSP header set by proxy.ts and stamps the nonce onto all generated tags.
  await connection();

  return (
    <html lang="en" className={lora.variable}>
      <body>{children}</body>
    </html>
  );
}
