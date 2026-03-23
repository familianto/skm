import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Laporan Keuangan Masjid — SKM',
  description: 'Ringkasan keuangan masjid untuk jamaah',
};

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-900 via-emerald-800 to-teal-900">
      {children}
    </div>
  );
}
