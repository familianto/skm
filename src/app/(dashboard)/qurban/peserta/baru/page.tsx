import Link from 'next/link';

import { getSessionFromCookieStore } from '@/lib/api/auth';
import { getEdisiContext } from '@/lib/qurban/edisi-context';
import { EDISI_STATUS } from '@/lib/qurban/edisi-state-machine';
import { canWritePeserta } from '@/lib/qurban/peserta-display';
import { PageTitle } from '@/components/layout/page-title';
import { Card, CardTitle } from '@/components/ui/card';
import { PesertaForm } from '@/components/qurban/PesertaForm';

/**
 * F4c-B — /qurban/peserta/baru (panitia registration form, PS2).
 *
 * Server wrapper: write-role gate (BENDAHARA is read-only → access card) +
 * edisi-context resolution. Registration requires an AKTIF edisi (PS2 contract);
 * NOT gated by the publik pendaftaran window — that only applies to the public
 * channel. Hands `edisiId` to the client form.
 */
export default async function PesertaBaruPage({
  searchParams,
}: {
  searchParams: Promise<{ edisi?: string }>;
}) {
  const params = await searchParams;
  const session = await getSessionFromCookieStore();
  const peran = session?.peran ?? '';

  if (peran && !canWritePeserta(peran)) {
    return (
      <div>
        <PageTitle title="Daftarkan Peserta" />
        <Card>
          <div className="text-center py-10">
            <p className="text-gray-600 text-sm">
              Anda tidak memiliki akses untuk mendaftarkan peserta.
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

  const ctx = peran ? await getEdisiContext({ peran, queryEdisiId: params.edisi }) : null;
  const edisi = ctx?.edisi ?? null;

  if (!edisi) {
    return (
      <div>
        <PageTitle title="Daftarkan Peserta" />
        <Card>
          <CardTitle>Belum ada edisi Qurban</CardTitle>
          <p className="text-sm text-gray-600 mt-2">
            Pendaftaran peserta dilakukan per edisi. Buat atau aktifkan sebuah edisi
            terlebih dahulu.
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
      </div>
    );
  }

  if (edisi.status !== EDISI_STATUS.AKTIF) {
    return (
      <div>
        <PageTitle title="Daftarkan Peserta" />
        <Card>
          <CardTitle>Edisi tidak aktif</CardTitle>
          <p className="text-sm text-gray-600 mt-2">
            Pendaftaran peserta hanya dapat dilakukan pada edisi berstatus AKTIF. Edisi
            terpilih berstatus <strong>{edisi.status}</strong>.
          </p>
          <Link
            href="/qurban/peserta"
            className="inline-block mt-4 text-emerald-600 hover:underline text-sm"
          >
            Kembali ke Daftar Peserta
          </Link>
        </Card>
      </div>
    );
  }

  return <PesertaForm edisiId={edisi.id} />;
}
