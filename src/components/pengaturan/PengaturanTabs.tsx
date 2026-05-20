'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

import { cn } from '@/lib/utils';

/**
 * Shared tab bar for the Pengaturan section.
 *
 * Three tabs render their content as in-page panels of `/pengaturan`:
 *   - Profil Masjid   → /pengaturan         (default; no query string)
 *   - Keamanan        → /pengaturan?tab=keamanan
 *   - Data            → /pengaturan?tab=data
 *
 * The "Anggota" tab navigates to the dedicated management route:
 *   - Anggota         → /pengaturan/anggota  (SUPER_ADMIN only)
 *
 * Active-tab detection:
 *   - When `pathname` starts with `/pengaturan/anggota` → Anggota is active
 *   - Otherwise the active tab is `?tab=` (default `profil`)
 *
 * Anggota is hidden for non-SUPER_ADMIN sessions per the same gate enforced
 * by middleware on `/pengaturan/anggota/**`. Passing `showAnggotaTab={false}`
 * also makes the tab safe to render for unauthenticated states (while the
 * me-hook is still loading).
 *
 * Suspense boundary is wrapped here because `useSearchParams()` requires it
 * on the Next 16 static-prerender path.
 */

interface Props {
  showAnggotaTab: boolean;
}

interface TabDef {
  key: string;
  label: string;
  href: string;
  pathPrefix?: string;
  requiresSuperAdmin?: boolean;
}

const TABS: TabDef[] = [
  { key: 'profil', label: 'Profil Masjid', href: '/pengaturan' },
  { key: 'keamanan', label: 'Keamanan', href: '/pengaturan?tab=keamanan' },
  {
    key: 'anggota',
    label: 'Anggota',
    href: '/pengaturan/anggota',
    pathPrefix: '/pengaturan/anggota',
    requiresSuperAdmin: true,
  },
  { key: 'data', label: 'Data', href: '/pengaturan?tab=data' },
];

export function PengaturanTabs(props: Props) {
  return (
    <Suspense
      fallback={<div className="h-12 mb-6 border-b border-gray-200" />}
    >
      <PengaturanTabsInner {...props} />
    </Suspense>
  );
}

function PengaturanTabsInner({ showAnggotaTab }: Props) {
  const pathname = usePathname() || '';
  const searchParams = useSearchParams();

  const isAnggotaRoute = pathname.startsWith('/pengaturan/anggota');
  const activeKey = isAnggotaRoute
    ? 'anggota'
    : searchParams.get('tab') || 'profil';

  const visibleTabs = TABS.filter(
    (t) => !t.requiresSuperAdmin || showAnggotaTab
  );

  return (
    <div className="flex gap-1 mb-6 border-b border-gray-200 overflow-x-auto">
      {visibleTabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          className={cn(
            'px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors -mb-px',
            activeKey === tab.key
              ? 'border-emerald-600 text-emerald-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          )}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
