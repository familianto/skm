import Link from 'next/link';

import { getSessionFromCookieStore } from '@/lib/api/auth';
import { getEdisiContext } from '@/lib/qurban/edisi-context';
import { PageTitle } from '@/components/layout/page-title';
import { Card, CardTitle } from '@/components/ui/card';
import { DashboardQurban } from '@/components/qurban/DashboardQurban';

/**
 * F8 Milestone A — Dashboard Qurban (`/qurban`).
 *
 * Server resolve edisi terpilih via edisi-context (selektor edisi sendiri
 * dirender oleh `./layout.tsx`), lalu serahkan `edisiId` ke client
 * `DashboardQurban` yang mengkonsumsi LP5
 * (`GET /api/qurban/laporan/dashboard`). Empty-state "belum ada edisi"
 * dipertahankan agar panitia tak pernah jatuh ke 404.
 *
 * Page-level access sudah di-gate middleware allow-list (`/qurban` untuk lima
 * peran). Sadar-arsip (badge "Arsip", label "Aktif", placeholder F7) di-handle
 * di komponen client.
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
      <PageTitle title="Modul Qurban" subtitle="Ringkasan edisi terpilih" />

      {edisi ? (
        <DashboardQurban edisiId={edisi.id} />
      ) : (
        <Card>
          <CardTitle>Belum ada edisi Qurban</CardTitle>
          <p className="mt-2 text-sm text-gray-600">
            Mulai dengan membuat edisi baru untuk tahun hijriah berikutnya.
            Setiap edisi mengelola peserta, hewan, dan distribusi secara
            terpisah.
          </p>
          <Link
            href="/qurban/edisi"
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
          >
            Kelola Edisi
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </Card>
      )}
    </div>
  );
}
