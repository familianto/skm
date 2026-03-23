import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SKM - Sistem Keuangan Masjid",
  description: "Sistem manajemen keuangan masjid berbasis web",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
