/**
 * Role-based access helpers per Tahap 3 §3.7 (Information Architecture) and
 * Tahap 3.E §3.1 A3 (/api/auth/me response).
 *
 * F1 scope (per agreed decision with Hopy):
 *   - Middleware strictly enforces ONLY `/pengaturan/anggota/**` and
 *     `/api/pengaturan/anggota/**` (SUPER_ADMIN only).
 *   - Other existing SKM routes are session-only (any authenticated user).
 *   - `can_access` patterns below are still computed for `/api/auth/me` so the
 *     UI can compute menu visibility consistently from F1 onward. F2 layers in
 *     strict middleware enforcement once `/qurban/*` exists.
 */

export const PERAN = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  BENDAHARA: 'BENDAHARA',
  ADMIN_QURBAN: 'ADMIN_QURBAN',
  PENDAFTARAN: 'PENDAFTARAN',
  DISTRIBUSI: 'DISTRIBUSI',
} as const;

export type Peran = (typeof PERAN)[keyof typeof PERAN];

export const VALID_PERAN = [
  PERAN.SUPER_ADMIN,
  PERAN.BENDAHARA,
  PERAN.ADMIN_QURBAN,
  PERAN.PENDAFTARAN,
  PERAN.DISTRIBUSI,
] as const;

export function isValidPeran(peran: string): peran is Peran {
  return (VALID_PERAN as readonly string[]).includes(peran);
}

/**
 * Where the user lands right after login.
 *
 * F02-A: Qurban-only roles (ADMIN_QURBAN, PENDAFTARAN, DISTRIBUSI) land on
 * `/qurban`; SKM-side roles (SUPER_ADMIN, BENDAHARA) land on `/`. The Qurban
 * dashboard handles the "no edisi yet" empty state gracefully so panitia roles
 * are never sent to a 404 even when no edisi has been created.
 */
export function getLandingUrl(peran: string): string {
  if (
    peran === PERAN.ADMIN_QURBAN ||
    peran === PERAN.PENDAFTARAN ||
    peran === PERAN.DISTRIBUSI
  ) {
    return '/qurban';
  }
  return '/';
}

/**
 * Path patterns the role may access. `**` matches anything.
 * Glob-style, intended to be evaluated by a path matcher (F2+ middleware).
 *
 * Distinction between full-write vs read-only access is enforced at the API
 * layer, not in this list (`can_access` returns the union of both).
 */
export function getCanAccess(peran: string): string[] {
  switch (peran) {
    case PERAN.SUPER_ADMIN:
      return ['**'];

    case PERAN.BENDAHARA:
      return [
        '/',
        '/transaksi/**',
        '/kategori/**',
        '/rekening/**',
        '/donatur/**',
        '/laporan/**',
        '/import-csv',
        '/rekonsiliasi/**',
        '/pengaturan',
        '/pengaturan/kategori/**',
        '/pengaturan/rekening/**',
        '/pengaturan/donatur/**',
        '/pengaturan/reminder/**',
        // Qurban: read-only for most, full access for /qurban/laporan/keuangan
        '/qurban',
        '/qurban/peserta/**',
        '/qurban/muqorib/**',
        '/qurban/hewan/**',
        '/qurban/pemetaan',
        '/qurban/pembayaran/**',
        '/qurban/edisi/**',
        '/qurban/konfigurasi',
        '/qurban/panitia/**',
        '/qurban/laporan/**',
      ];

    case PERAN.ADMIN_QURBAN:
      return [
        '/',
        '/laporan/**',
        '/qurban',
        '/qurban/**',
      ];

    case PERAN.PENDAFTARAN:
      return [
        '/',
        '/qurban',
        '/qurban/peserta/**',
        '/qurban/muqorib/**',
        '/qurban/hewan/**',
        '/qurban/pemetaan',
        '/qurban/pembayaran/**',
        '/qurban/edisi/**',
        '/qurban/konfigurasi',
        '/qurban/panitia/**',
        '/qurban/laporan/**',
      ];

    case PERAN.DISTRIBUSI:
      return [
        '/',
        '/qurban',
        '/qurban/distribusi/**',
        '/qurban/laporan/**',
      ];

    default:
      return ['/'];
  }
}

/** Panitia roles (PENDAFTARAN, DISTRIBUSI) can only operate on the AKTIF edisi. */
export function isEdisiLockedToAktif(peran: string): boolean {
  return peran === PERAN.PENDAFTARAN || peran === PERAN.DISTRIBUSI;
}

/** Only SUPER_ADMIN can manage anggota (CRUD U1-U9). */
export function canManageAnggota(peran: string): boolean {
  return peran === PERAN.SUPER_ADMIN;
}
