import Link from 'next/link';

import { getSessionFromCookieStore } from '@/lib/api/auth';
import { getEdisiContext } from '@/lib/qurban/edisi-context';
import { PageTitle } from '@/components/layout/page-title';
import { Card, CardTitle } from '@/components/ui/card';
import { PemetaanBoard } from '@/components/qurban/PemetaanBoard';

/**
 * F5b B — /qurban/pemetaan
 *
 * Per-edisi: server resolve edisi via `getEdisiContext` (?edisi → cookie →
 * AKTIF default) lalu kirim `edisiId` ke client `PemetaanBoard`. Tidak ada
 * edisi → empty state dengan CTA "Kelola Edisi". Page-level role gating
 * sudah ditangani middleware (`path-rules.ts` regex `/qurban/(...|pemetaan|...)`).
 */
export default async function PemetaanPage({
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
        title="Pemetaan Peserta ↔ Hewan"
        subtitle="Atur penempatan slot per hewan; simpan-sekali dengan token concurrency."
      />

      {edisi ? (
        <PemetaanBoard edisiId={edisi.id} />
      ) : (
        <Card>
          <CardTitle>Belum ada edisi Qurban</CardTitle>
          <p className="text-sm text-gray-600 mt-2">
            Pemetaan dilakukan per edisi. Buat atau aktifkan sebuah edisi
            terlebih dahulu untuk mulai mengatur peserta dan slot hewan.
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
