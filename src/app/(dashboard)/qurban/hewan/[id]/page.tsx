import Link from 'next/link';

import { getSessionFromCookieStore } from '@/lib/api/auth';
import { getEdisiContext } from '@/lib/qurban/edisi-context';
import { PageTitle } from '@/components/layout/page-title';
import { Card, CardTitle } from '@/components/ui/card';
import { HewanDetail } from '@/components/qurban/HewanDetail';

/**
 * F5a Milestone C — /qurban/hewan/[id] (detail, H3).
 *
 * Server wrapper resolves the selected edisi, then hands `edisiId` + `hewanId`
 * to the client detail view (which calls H3 with `?edisi_id=`).
 */
export default async function HewanDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edisi?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const session = await getSessionFromCookieStore();
  const peran = session?.peran ?? '';

  const ctx = peran ? await getEdisiContext({ peran, queryEdisiId: sp.edisi }) : null;
  const edisi = ctx?.edisi ?? null;

  if (!edisi) {
    return (
      <div>
        <PageTitle title="Detail Hewan" />
        <Card>
          <CardTitle>Belum ada edisi Qurban</CardTitle>
          <p className="text-sm text-gray-600 mt-2">
            Inventaris hewan dikelola per edisi. Pilih edisi terlebih dahulu.
          </p>
          <Link
            href="/qurban/hewan"
            className="inline-block mt-4 text-emerald-600 hover:underline text-sm"
          >
            Kembali
          </Link>
        </Card>
      </div>
    );
  }

  return <HewanDetail edisiId={edisi.id} hewanId={id} />;
}
