import Link from 'next/link';

import { getSessionFromCookieStore } from '@/lib/api/auth';
import { getEdisiContext } from '@/lib/qurban/edisi-context';
import { PageTitle } from '@/components/layout/page-title';
import { Card, CardTitle } from '@/components/ui/card';

/**
 * F02-A skeleton dashboard for `/qurban`.
 *
 * Body content (no edisi yet → empty state for every role). Milestone B will
 * populate quick-stats once edisi CRUD endpoints land; for now the body
 * advertises the next action ("buat edisi") and shows a dead link to
 * `/qurban/edisi` (built in Milestone B).
 *
 * Page-level access has already been gated by the middleware allow-list
 * (`/qurban` allowed for all five roles). EditionSwitcher renders in the
 * parent layout (`./layout.tsx`).
 */
export default async function QurbanDashboardPage({
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
      <PageTitle title="Modul Qurban" />

      {edisi ? (
        <Card className="mb-6">
          <CardTitle>
            Edisi {edisi.tahun_hijriah}{' '}
            <span className="text-sm font-normal text-gray-500">
              ({edisi.status})
            </span>
          </CardTitle>
          <p className="text-sm text-gray-600 mt-2">
            Idul Adha: {edisi.tanggal_idul_adha || '—'} · Pendaftaran:{' '}
            {edisi.tanggal_pendaftaran_buka || '—'} s/d{' '}
            {edisi.tanggal_pendaftaran_tutup || '—'}
          </p>
        </Card>
      ) : (
        <Card className="mb-6">
          <CardTitle>Belum ada edisi Qurban</CardTitle>
          <p className="text-sm text-gray-600 mt-2">
            Mulai dengan membuat edisi baru untuk tahun hijriah berikutnya.
            Setiap edisi mengelola peserta, hewan, dan distribusi secara
            terpisah.
          </p>
        </Card>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardTitle>Peserta</CardTitle>
          <p className="text-2xl font-semibold text-gray-400 mt-2">—</p>
          <p className="text-xs text-gray-500 mt-1">Tersedia setelah edisi dibuat.</p>
        </Card>
        <Card>
          <CardTitle>Hewan</CardTitle>
          <p className="text-2xl font-semibold text-gray-400 mt-2">—</p>
          <p className="text-xs text-gray-500 mt-1">Tersedia setelah edisi dibuat.</p>
        </Card>
        <Card>
          <CardTitle>Distribusi</CardTitle>
          <p className="text-2xl font-semibold text-gray-400 mt-2">—</p>
          <p className="text-xs text-gray-500 mt-1">Tersedia setelah edisi dibuat.</p>
        </Card>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          href="/qurban/edisi"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors"
        >
          Kelola Edisi
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      </div>
    </div>
  );
}
