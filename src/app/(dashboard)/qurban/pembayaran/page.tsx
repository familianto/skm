import Link from 'next/link';

import { getSessionFromCookieStore } from '@/lib/api/auth';
import { getEdisiContext } from '@/lib/qurban/edisi-context';
import { PageTitle } from '@/components/layout/page-title';
import { Card, CardTitle } from '@/components/ui/card';
import { PembayaranList } from '@/components/qurban/PembayaranList';

/**
 * F6 D2 — /qurban/pembayaran (manajemen pembayaran qurban).
 *
 * PER-EDISI (seperti /qurban/peserta): server resolve edisi terpilih via
 * edisi-context, lalu serahkan `edisiId` ke client list. Akses di-gate
 * SA/BD/AQ/PD oleh middleware (`path-rules.ts`, pola `pembayaran`).
 *
 * Struktur tab disiapkan untuk M-D3 (tab "Rekonsiliasi"); D2 = tab tunggal
 * "Daftar Pembayaran".
 */
export default async function PembayaranPage({
  searchParams,
}: {
  searchParams: Promise<{ edisi?: string }>;
}) {
  const params = await searchParams;
  const session = await getSessionFromCookieStore();
  const peran = session?.peran ?? '';

  const ctx = peran ? await getEdisiContext({ peran, queryEdisiId: params.edisi }) : null;
  const edisi = ctx?.edisi ?? null;

  return (
    <div>
      <PageTitle
        title="Pembayaran Qurban"
        subtitle="Kelola pembayaran peserta (per edisi)"
      />

      {edisi ? (
        <PembayaranList edisiId={edisi.id} />
      ) : (
        <Card>
          <CardTitle>Belum ada edisi Qurban</CardTitle>
          <p className="text-sm text-gray-600 mt-2">
            Pembayaran dikelola per edisi. Buat atau aktifkan sebuah edisi
            terlebih dahulu untuk melihat daftar pembayaran.
          </p>
          <Link
            href="/qurban/edisi"
            className="inline-flex items-center gap-2 mt-4 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors"
          >
            Kelola Edisi
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </Card>
      )}
    </div>
  );
}
