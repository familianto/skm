import Link from 'next/link';

import { getSessionFromCookieStore } from '@/lib/api/auth';
import { getEdisiContext } from '@/lib/qurban/edisi-context';
import { PageTitle } from '@/components/layout/page-title';
import { Card, CardTitle } from '@/components/ui/card';
import { PesertaList } from '@/components/qurban/PesertaList';

/**
 * F4c-A — /qurban/peserta (list).
 *
 * PER-EDISI page (like /qurban/hewan): the server resolves the selected edisi
 * via edisi-context (?edisi= → cookie → AKTIF default) and hands `edisiId` to
 * the client list. No edisi → empty-state with a "Kelola Edisi" CTA. Page
 * access is gated to SA/BD/AQ/PD by middleware (`path-rules.ts`).
 */
export default async function PesertaListPage({
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
        title="Peserta Qurban"
        subtitle="Daftar pendaftaran peserta (per edisi)"
      />

      {edisi ? (
        <PesertaList edisiId={edisi.id} />
      ) : (
        <Card>
          <CardTitle>Belum ada edisi Qurban</CardTitle>
          <p className="text-sm text-gray-600 mt-2">
            Peserta didaftarkan per edisi. Buat atau aktifkan sebuah edisi
            terlebih dahulu untuk melihat daftar peserta.
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
