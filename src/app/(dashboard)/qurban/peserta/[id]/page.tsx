import Link from 'next/link';

import { getSessionFromCookieStore } from '@/lib/api/auth';
import { getEdisiContext } from '@/lib/qurban/edisi-context';
import { PageTitle } from '@/components/layout/page-title';
import { Card, CardTitle } from '@/components/ui/card';
import { PesertaDetail } from '@/components/qurban/PesertaDetail';

/**
 * F4c-A — /qurban/peserta/[id] (detail, PS3).
 *
 * Server wrapper resolves the selected edisi, then hands `edisiId` + `pesertaId`
 * to the client detail view (which calls PS3 with `?edisi_id=`). PS3 enforces
 * that the peserta belongs to the resolved edisi (404 otherwise).
 */
export default async function PesertaDetailPage({
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
        <PageTitle title="Detail Peserta" />
        <Card>
          <CardTitle>Belum ada edisi Qurban</CardTitle>
          <p className="text-sm text-gray-600 mt-2">
            Peserta dikelola per edisi. Pilih edisi terlebih dahulu.
          </p>
          <Link
            href="/qurban/peserta"
            className="inline-block mt-4 text-emerald-600 hover:underline text-sm"
          >
            Kembali
          </Link>
        </Card>
      </div>
    );
  }

  return <PesertaDetail edisiId={edisi.id} pesertaId={id} />;
}
