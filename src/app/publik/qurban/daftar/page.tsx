import type { Metadata } from 'next';

import { PublikDaftarWizard } from '@/components/qurban/PublikDaftarWizard';

/**
 * F4c-E — public registration page. No auth, no dashboard sidebar, no
 * edisi-switcher (the AKTIF edisi is implicit via PB1). Mobile-first; mirrors
 * the visual shell of `/publik/qurban` (green header + max-w-lg content).
 */

export const metadata: Metadata = {
  title: 'Pendaftaran Qurban — Masjid Al Jabar',
  description: 'Formulir pendaftaran qurban Masjid Al Jabar Jatinegara Baru',
  robots: { index: false, follow: false },
};

export default function PublikDaftarPage() {
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
              <div className="text-[13px] font-semibold">Pendaftaran Qurban</div>
            </div>
          </div>
          <h1 className="text-[22px] font-bold leading-tight mt-3">Daftar Qurban</h1>
          <p className="text-xs opacity-80 mt-1">Isi formulir berikut untuk mendaftarkan qurban Anda.</p>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-3 py-4">
        <PublikDaftarWizard />
      </main>

      <footer className="text-center py-6 px-3 text-[10px] text-gray-400 leading-relaxed">
        &copy; Masjid Al Jabar Jatinegara Baru
      </footer>
    </div>
  );
}
