import type { Metadata } from 'next';

import { PublikCekStatus } from '@/components/qurban/PublikCekStatus';

/**
 * F4c-F — public cek-status page. No auth/sidebar; mobile-first; mirrors the
 * `/publik/qurban/daftar` shell. Consumes PB4 (masked names).
 */

export const metadata: Metadata = {
  title: 'Cek Status Qurban — Masjid Al Jabar',
  description: 'Cek status pendaftaran qurban Masjid Al Jabar Jatinegara Baru',
  robots: { index: false, follow: false },
};

export default function PublikCekStatusPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gradient-to-br from-[#0a3d29] via-[#0d5c3f] to-emerald-600 text-white px-4 py-5 pb-6">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-white/20 rounded-full flex items-center justify-center text-lg">
              {'\u{1F54C}'}
            </div>
            <div>
              <div className="text-[11px] opacity-85">Masjid Al Jabar Jatinegara Baru</div>
              <div className="text-[13px] font-semibold">Cek Status Qurban</div>
            </div>
          </div>
          <h1 className="text-[22px] font-bold leading-tight mt-3">Cek Status Pendaftaran</h1>
          <p className="text-xs opacity-80 mt-1">Cari dengan kode bayar atau nomor HP Anda.</p>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-3 py-4">
        <PublikCekStatus />
      </main>

      <footer className="text-center py-6 px-3 text-[10px] text-gray-400 leading-relaxed">
        &copy; Masjid Al Jabar Jatinegara Baru
      </footer>
    </div>
  );
}
