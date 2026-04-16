import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Laporan Qurban 1447H — Masjid Al Jabar',
  description: 'Laporan progress Qurban 1447H Masjid Al Jabar Jatinegara Baru',
  robots: { index: false, follow: false },
};

export default function QurbanLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
