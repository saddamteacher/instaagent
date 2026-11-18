import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Jarvisgram",
  description: "Instagram akkauntlarini AI-agentlar jamoasi bilan boshqarish",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="uz">
      <body>{children}</body>
    </html>
  );
}
