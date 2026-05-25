import { Suspense } from 'react';
import Link from 'next/link';

import { getSessionFromCookieStore } from '@/lib/api/auth';
import { getEdisiContext } from '@/lib/qurban/edisi-context';
import { PageTitle } from '@/components/layout/page-title';
import { Card, CardTitle } from '@/components/ui/card';
import { Loading } from '@/components/ui/loading';
import { HewanTabs } from '@/components/qurban/HewanTabs';

/**
 * F03 Milestone E — /qurban/hewan (Master Hewan).
 *
 * PER-EDISI page (unlike Muqorib): resolves the selected edisi via
 * edisi-context (?edisi= → cookie → AKTIF default), exactly like the
 * `/qurban` dashboard. Page access is gated to SA/BD/AQ/PD by middleware
 * (`path-rules.ts`); write actions (SA/AQ) are gated inside the tab.
 * The EditionSwitcher strip in the shared `/qurban` layout is relevant here.
 */
export default async function MasterHewanPage({
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
        title="Hewan Qurban"
        subtitle="Master tipe hewan & inventaris fisik per ekor (per edisi)"
      />

      {edisi ? (
        <Suspense fallback={<Loading className="my-8" />}>
          <HewanTabs
            edisiId={edisi.id}
            edisiStatus={edisi.status}
            edisiTahun={edisi.tahun_hijriah}
          />
        </Suspense>
      ) : (
        <Card>
          <CardTitle>Belum ada edisi Qurban</CardTitle>
          <p className="text-sm text-gray-600 mt-2">
            Master tipe hewan dikelola per edisi. Buat atau aktifkan sebuah edisi
            terlebih dahulu untuk mulai menambah tipe hewan.
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
