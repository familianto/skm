import Link from 'next/link';

import { getSessionFromCookieStore } from '@/lib/api/auth';
import { getEdisiContext } from '@/lib/qurban/edisi-context';
import { canWritePeserta } from '@/lib/qurban/peserta-display';
import { PageTitle } from '@/components/layout/page-title';
import { Card, CardTitle } from '@/components/ui/card';
import { PesertaEditForm } from '@/components/qurban/PesertaEditForm';

/**
 * F4c-D — /qurban/peserta/[id]/edit (PS4).
 *
 * Server wrapper: write-role gate (BENDAHARA read-only → access card) +
 * edisi-context resolution. Hands `edisiId` + `pesertaId` to the client form.
 */
export default async function PesertaEditPage({
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

  if (peran && !canWritePeserta(peran)) {
    return (
      <div>
        <PageTitle title="Edit Peserta" />
        <Card>
          <div className="text-center py-10">
            <p className="text-gray-600 text-sm">
              Anda tidak memiliki akses untuk mengubah peserta.
            </p>
            <Link
              href="/qurban/peserta"
              className="inline-block mt-4 text-emerald-600 hover:underline text-sm"
            >
              Kembali ke Daftar Peserta
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  const ctx = peran ? await getEdisiContext({ peran, queryEdisiId: sp.edisi }) : null;
  const edisi = ctx?.edisi ?? null;

  if (!edisi) {
    return (
      <div>
        <PageTitle title="Edit Peserta" />
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

  return <PesertaEditForm edisiId={edisi.id} pesertaId={id} />;
}
