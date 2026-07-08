import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ping Game",
  description: "Live-Karten-Spiel mit Pings, Rollen und Admin-Steuerung",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
