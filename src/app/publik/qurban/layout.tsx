import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Qurban — Masjid Al Jabar',
  description: 'Pendaftaran & status Qurban Masjid Al Jabar Jatinegara Baru',
  robots: { index: false, follow: false },
};

export default function QurbanLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
