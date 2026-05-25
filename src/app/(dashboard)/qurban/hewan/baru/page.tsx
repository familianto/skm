import Link from 'next/link';

import { getSessionFromCookieStore } from '@/lib/api/auth';
import { getEdisiContext } from '@/lib/qurban/edisi-context';
import { PageTitle } from '@/components/layout/page-title';
import { Card, CardTitle } from '@/components/ui/card';
import { HewanCreateForm } from '@/components/qurban/HewanCreateForm';

/**
 * F5a Milestone C — /qurban/hewan/baru (create, H2).
 *
 * Server wrapper resolves the selected edisi (mirror `/qurban/hewan` page),
 * then hands `edisiId` to the client form. Page access is gated to SA/BD/AQ/PD
 * by middleware; write gating (SA/AQ/PD) is enforced in the form + server.
 */
export default async function HewanBaruPage({
  searchParams,
}: {
  searchParams: Promise<{ edisi?: string }>;
}) {
  const params = await searchParams;
  const session = await getSessionFromCookieStore();
  const peran = session?.peran ?? '';

  const ctx = peran ? await getEdisiContext({ peran, queryEdisiId: params.edisi }) : null;
  const edisi = ctx?.edisi ?? null;

  if (!edisi) {
    return (
      <div>
        <PageTitle title="Tambah Hewan" />
        <Card>
          <CardTitle>Belum ada edisi Qurban</CardTitle>
          <p className="text-sm text-gray-600 mt-2">
            Inventaris hewan dikelola per edisi. Buat atau aktifkan sebuah edisi
            terlebih dahulu.
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

  return <HewanCreateForm edisiId={edisi.id} />;
}
