import Link from 'next/link';

import { getSessionFromCookieStore } from '@/lib/api/auth';
import { getEdisiContext } from '@/lib/qurban/edisi-context';
import { PageTitle } from '@/components/layout/page-title';
import { Card, CardTitle } from '@/components/ui/card';
import { LaporanQurban } from '@/components/qurban/LaporanQurban';

/**
 * F8 Milestone B — Laporan Qurban (`/qurban/laporan`), shell bertab.
 *
 * Server resolve edisi terpilih via edisi-context (selektor edisi dirender oleh
 * `../layout.tsx`), lalu serahkan `edisiId` ke client `LaporanQurban`. Tab:
 * Peserta (penuh, LP1) · Hewan · Keuangan (placeholder, Milestone C/D).
 * Distribusi TIDAK ditampilkan. Empty-state "belum ada edisi" dipertahankan.
 *
 * Access di-gate middleware (`path-rules.ts`, pola `laporan`) untuk kelima
 * peran.
 */
export default async function LaporanQurbanPage({
  searchParams,
}: {
  searchParams: Promise<{ edisi?: string }>;
}) {
  const params = await searchParams;
  const session = await getSessionFromCookieStore();
  const peran = session?.peran ?? '';

  const ctx = peran
    ? await getEdisiContext({ peran, queryEdisiId: params.edisi })
    : null;

  const edisi = ctx?.edisi ?? null;

  return (
    <div>
      <PageTitle title="Laporan Qurban" subtitle="Ringkasan & rekap per edisi" />

      {edisi ? (
        <LaporanQurban edisiId={edisi.id} />
      ) : (
        <Card>
          <CardTitle>Belum ada edisi Qurban</CardTitle>
          <p className="mt-2 text-sm text-gray-600">
            Laporan dihitung per edisi. Buat atau aktifkan sebuah edisi terlebih
            dahulu untuk melihat laporan.
          </p>
          <Link
            href="/qurban/edisi"
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
          >
            Kelola Edisi
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </Card>
      )}
    </div>
  );
}
