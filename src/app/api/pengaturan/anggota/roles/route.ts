import { NextRequest } from 'next/server';

import { success } from '@/lib/api/response';
import { requireSuperAdmin } from '@/lib/api/guards';
import { VALID_PERAN } from '@/lib/api/permissions';

/**
 * U9 — GET /api/pengaturan/anggota/roles
 *
 * Returns the valid peran enum for dropdown rendering in the Anggota CRUD
 * form. Each entry includes a Bahasa label suitable for direct display.
 *
 * The label catalog lives here (server-side) so it's a single source of
 * truth shared between the form and admin reports. F2+ can extend this
 * with role descriptions / capability bullets if needed.
 */

const PERAN_LABELS: Record<string, { label: string; description: string }> = {
  SUPER_ADMIN: {
    label: 'Super Admin',
    description: 'Akses penuh termasuk manajemen anggota.',
  },
  BENDAHARA: {
    label: 'Bendahara',
    description: 'Pengelola penuh keuangan SKM. Akses Qurban read-only.',
  },
  ADMIN_QURBAN: {
    label: 'Admin Qurban',
    description: 'Ketua panitia Qurban. Akses penuh modul Qurban.',
  },
  PENDAFTARAN: {
    label: 'Pendaftaran',
    description: 'Panitia pendaftaran muqorib, pemetaan, dan pembayaran.',
  },
  DISTRIBUSI: {
    label: 'Distribusi',
    description: 'Panitia distribusi: cetak label, tracking pengiriman.',
  },
};

export async function GET(request: NextRequest) {
  const guard = await requireSuperAdmin(request);
  if (!guard.ok) return guard.response;

  return success(
    VALID_PERAN.map((peran) => ({
      value: peran,
      label: PERAN_LABELS[peran]?.label || peran,
      description: PERAN_LABELS[peran]?.description || '',
    }))
  );
}
