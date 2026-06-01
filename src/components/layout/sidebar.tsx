'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { resolveActiveHref } from '@/lib/nav-active';
import { useMe } from '@/hooks/use-me';

type Peran = 'SUPER_ADMIN' | 'BENDAHARA' | 'ADMIN_QURBAN' | 'PENDAFTARAN' | 'DISTRIBUSI';

interface NavItem {
  href: string;
  label: string;
  icon: string;
  /** When set, item only renders for these peran (full or read-only). */
  visibleRoles?: Peran[];
  /** Peran that see the item grayed-out with a lock icon. */
  disabledRoles?: Peran[];
  /** Peran that see the item with a read-only eye indicator. */
  readOnlyRoles?: Peran[];
}

interface NavSection {
  label: string;
  items: NavItem[];
}

const QURBAN_ICON =
  'M19 14l-7 7m0 0l-7-7m7 7V3';
// "Edisi" — calendar-clock-ish glyph
const QURBAN_EDISI_ICON =
  'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z';
// "Muqorib" — people/jamaah glyph
const QURBAN_MUQORIB_ICON =
  'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z';
// "Hewan" — cube/catalog glyph
const QURBAN_HEWAN_ICON =
  'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4';
// "Peserta" — clipboard/list glyph
const QURBAN_PESERTA_ICON =
  'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4';
// "Pemetaan" — grid/board glyph (board pemetaan drag-drop)
const QURBAN_PEMETAAN_ICON =
  'M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z';

// "Pembayaran" — banknote/cash glyph
const QURBAN_PEMBAYARAN_ICON =
  'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m3-6h8a2 2 0 012 2v6a2 2 0 01-2 2h-8a2 2 0 01-2-2v-6a2 2 0 012-2zm5 5a1 1 0 11-2 0 1 1 0 012 0z';

const navSections: NavSection[] = [
  {
    label: 'Utama',
    items: [
      { href: '/', label: 'Dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
      { href: '/transaksi', label: 'Transaksi', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
      { href: '/kelompok', label: 'Kelompok Anggaran', icon: 'M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z' },
      { href: '/import', label: 'Import CSV', icon: 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12' },
    ],
  },
  {
    label: 'Qurban',
    items: [
      {
        href: '/qurban',
        label: 'Dashboard',
        icon: QURBAN_ICON,
        visibleRoles: ['SUPER_ADMIN', 'BENDAHARA', 'ADMIN_QURBAN', 'PENDAFTARAN', 'DISTRIBUSI'],
      },
      {
        href: '/qurban/edisi',
        label: 'Edisi',
        icon: QURBAN_EDISI_ICON,
        visibleRoles: ['SUPER_ADMIN', 'BENDAHARA', 'ADMIN_QURBAN', 'PENDAFTARAN', 'DISTRIBUSI'],
        readOnlyRoles: ['BENDAHARA', 'PENDAFTARAN'],
        disabledRoles: ['DISTRIBUSI'],
      },
      {
        href: '/qurban/muqorib',
        label: 'Muqorib',
        icon: QURBAN_MUQORIB_ICON,
        visibleRoles: ['SUPER_ADMIN', 'BENDAHARA', 'ADMIN_QURBAN', 'PENDAFTARAN'],
        readOnlyRoles: ['BENDAHARA'],
      },
      {
        href: '/qurban/hewan',
        label: 'Hewan',
        icon: QURBAN_HEWAN_ICON,
        visibleRoles: ['SUPER_ADMIN', 'BENDAHARA', 'ADMIN_QURBAN', 'PENDAFTARAN'],
        readOnlyRoles: ['BENDAHARA', 'PENDAFTARAN'],
      },
      {
        href: '/qurban/pemetaan',
        label: 'Pemetaan',
        icon: QURBAN_PEMETAAN_ICON,
        visibleRoles: ['SUPER_ADMIN', 'BENDAHARA', 'ADMIN_QURBAN', 'PENDAFTARAN', 'DISTRIBUSI'],
        readOnlyRoles: ['BENDAHARA', 'DISTRIBUSI'],
      },
      {
        href: '/qurban/peserta',
        label: 'Peserta',
        icon: QURBAN_PESERTA_ICON,
        visibleRoles: ['SUPER_ADMIN', 'BENDAHARA', 'ADMIN_QURBAN', 'PENDAFTARAN'],
        readOnlyRoles: ['BENDAHARA'],
      },
      {
        href: '/qurban/pembayaran',
        label: 'Pembayaran',
        icon: QURBAN_PEMBAYARAN_ICON,
        visibleRoles: ['SUPER_ADMIN', 'BENDAHARA', 'ADMIN_QURBAN', 'PENDAFTARAN'],
      },
    ],
  },
  {
    label: 'Laporan',
    items: [
      { href: '/laporan', label: 'Laporan', icon: 'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
      { href: '/rekonsiliasi', label: 'Rekonsiliasi', icon: 'M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z' },
    ],
  },
  {
    label: 'Pengaturan',
    items: [
      { href: '/kategori', label: 'Kategori', icon: 'M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z' },
      { href: '/rekening', label: 'Rekening', icon: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z' },
      { href: '/donatur', label: 'Donatur', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z' },
      { href: '/reminder', label: 'Reminder WA', icon: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z' },
      { href: '/pengaturan', label: 'Pengaturan', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z' },
    ],
  },
];

const TV_DISPLAY_ICON = 'M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z';

interface SidebarProps {
  masjidName?: string;
  logoUrl?: string;
}

export function Sidebar({ masjidName = 'SKM', logoUrl }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { me } = useMe();
  const peran = me?.user.peran as Peran | undefined;

  const activeHref = resolveActiveHref(
    pathname,
    navSections.flatMap((s) => s.items.map((i) => i.href))
  );

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  };

  const visibleSections = navSections
    .map((section) => ({
      ...section,
      items: section.items.filter(
        (item) => !item.visibleRoles || (peran && item.visibleRoles.includes(peran))
      ),
    }))
    .filter((section) => section.items.length > 0);

  const navContent = (
    <>
      {/* Logo */}
      <div className="px-4 py-6 border-b border-emerald-700">
        <div className="flex items-center gap-3">
          {logoUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={logoUrl}
              alt="Logo"
              width={40}
              height={40}
              className="w-10 h-10 rounded-full object-cover border-2 border-emerald-600 shrink-0"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-emerald-600 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-white truncate">{masjidName}</h1>
            <p className="text-emerald-200 text-xs">Sistem Keuangan Masjid</p>
          </div>
        </div>
      </div>

      {/* Nav Sections */}
      <nav className="flex-1 px-3 py-4 space-y-4 overflow-y-auto">
        {visibleSections.map((section) => (
          <div key={section.label}>
            <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-emerald-400/70">
              {section.label}
            </p>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const isActive = !!activeHref && item.href === activeHref;
                const isDisabled = peran ? item.disabledRoles?.includes(peran) : false;
                const isReadOnly = peran ? item.readOnlyRoles?.includes(peran) : false;
                const baseClass = cn(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                  isDisabled
                    ? 'text-emerald-300/60 cursor-not-allowed'
                    : isActive
                    ? 'bg-emerald-700 text-white'
                    : 'text-emerald-100 hover:bg-emerald-700/50'
                );
                const content = (
                  <>
                    <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={item.icon} />
                    </svg>
                    <span className="flex-1">{item.label}</span>
                    {isDisabled && (
                      <svg className="w-3.5 h-3.5 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-label="Tidak tersedia">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c0-1.105-.895-2-2-2s-2 .895-2 2v3m9 0V8a5 5 0 00-10 0v3M5 14h14v7H5v-7z" />
                      </svg>
                    )}
                    {!isDisabled && isReadOnly && (
                      <svg className="w-3.5 h-3.5 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-label="Lihat saja">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </>
                );
                if (isDisabled) {
                  return (
                    <span
                      key={item.href}
                      className={baseClass}
                      title="Tidak tersedia untuk peran Anda"
                      aria-disabled="true"
                    >
                      {content}
                    </span>
                  );
                }
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={baseClass}
                    title={isReadOnly ? 'Hanya lihat (read-only)' : undefined}
                  >
                    {content}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Lainnya: TV Display + Logout */}
      <div className="px-3 py-4 border-t border-emerald-700">
        <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-emerald-400/70">
          Lainnya
        </p>
        <div className="space-y-0.5">
          <a
            href="/publik"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm font-medium text-emerald-100 hover:bg-emerald-700/50 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={TV_DISPLAY_ICON} />
            </svg>
            TV Display
            <svg className="w-3 h-3 ml-auto opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm font-medium text-emerald-100 hover:bg-emerald-700/50 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Keluar
          </button>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile toggle */}
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-30 p-2 bg-emerald-600 text-white rounded-lg shadow-lg"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40 bg-black/50" onClick={() => setMobileOpen(false)} />
      )}

      {/* Mobile sidebar */}
      <div
        className={cn(
          'lg:hidden fixed inset-y-0 left-0 z-50 w-64 bg-emerald-800 flex flex-col transition-transform duration-200',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {navContent}
      </div>

      {/* Desktop sidebar */}
      <div className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 bg-emerald-800">
        {navContent}
      </div>
    </>
  );
}
