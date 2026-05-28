import { NextRequest } from 'next/server';

import { success, error, type ApiSuccess } from '@/lib/api/response';
import { ErrorCodes } from '@/lib/api/errors';
import { requireRole } from '@/lib/api/guards';
import { PERAN } from '@/lib/api/permissions';

import { listAllMuqorib } from '@/lib/qurban/muqorib-repo';
import { scoreLookupCandidate } from '@/lib/qurban/validators';
import { isPhoneQuery, selectActiveMuqoribByPhone } from '@/lib/qurban/muqorib-lookup';

const LOOKUP_ROLES = [PERAN.SUPER_ADMIN, PERAN.ADMIN_QURBAN, PERAN.PENDAFTARAN];

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 25;
const DEFAULT_MIN_SCORE = 0.6;

/**
 * M7 — GET /api/qurban/muqorib/lookup?q=...&limit=...&min_score=...
 *
 * Smart autocomplete atas muqorib AKTIF (lintas-edisi). Scoring delegated to
 * `scoreLookupCandidate`. `has_history` stub `false` sampai F04.
 *
 * F4d (Milestone B):
 * - Bila `q` terlihat seperti nomor HP (`isPhoneQuery`) → **exact-match HP**
 *   via `selectActiveMuqoribByPhone`; balas paling banyak 1 kandidat
 *   (`score: 1.0`). 1 HP = 1 muqorib (grain seed), jadi tidak ada ambigu.
 * - Sebaliknya → fuzzy name autocomplete seperti sebelumnya.
 * - **Response no_hp TIDAK lagi di-mask** — panitia (SA/AQ/PD) berhak data
 *   penuh (PII matrix). Jalur publik (PB2) tetap memakai jalur tersamarnya
 *   sendiri di `/api/publik/qurban/daftar/lookup`.
 */
export async function GET(request: NextRequest) {
  const guard = await requireRole(request, LOOKUP_ROLES);
  if (!guard.ok) return guard.response;

  try {
    const url = new URL(request.url);

    const q = (url.searchParams.get('q') || '').trim();
    if (!q) {
      return error(
        ErrorCodes.VALIDATION_FAILED,
        'Query `q` wajib diisi.',
        400,
        { field: 'q' }
      );
    }

    const requestedLimit = parseInt(
      url.searchParams.get('limit') || String(DEFAULT_LIMIT),
      10
    );
    if (!Number.isFinite(requestedLimit) || requestedLimit < 1) {
      return error(
        ErrorCodes.VALIDATION_FAILED,
        'limit harus bilangan positif.',
        400,
        { field: 'limit' }
      );
    }
    const limit = Math.min(requestedLimit, MAX_LIMIT);

    const minScoreParam = url.searchParams.get('min_score');
    let minScore = DEFAULT_MIN_SCORE;
    if (minScoreParam !== null) {
      const parsed = Number(minScoreParam);
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
        return error(
          ErrorCodes.VALIDATION_FAILED,
          'min_score harus berada di rentang 0–1.',
          400,
          { field: 'min_score' }
        );
      }
      minScore = parsed;
    }

    const all = await listAllMuqorib();

    // Phone-exact branch (F4d M-B). Returns 0 or 1 candidate; min_score is
    // moot when the match scores 1.0, but we still respect it for symmetry.
    if (isPhoneQuery(q)) {
      const match = selectActiveMuqoribByPhone(all, q);
      const candidates = match
        ? [
            {
              id: match.id,
              nama_lengkap: match.nama_lengkap,
              alamat: match.alamat,
              rt: match.rt,
              no_hp: match.no_hp,
              is_active: match.is_active,
              score: 1.0,
              // TODO F04: resolve has_history dari qurban_peserta
              has_history: false,
            },
          ]
        : [];
      const filtered = candidates.filter((c) => c.score >= minScore).slice(0, limit);
      const meta = {
        q,
        limit,
        min_score: minScore,
        count: filtered.length,
      } as unknown as ApiSuccess<typeof filtered>['meta'];
      return success(filtered, meta);
    }

    // Name-fuzzy branch (default).
    const qn = q.toLowerCase();
    const scored = all
      .filter((m) => m.is_active)
      .map((m) => {
        const score = scoreLookupCandidate(q, qn, m);
        return {
          id: m.id,
          nama_lengkap: m.nama_lengkap,
          alamat: m.alamat,
          rt: m.rt,
          no_hp: m.no_hp,
          is_active: m.is_active,
          score,
          // TODO F04: resolve has_history dari qurban_peserta
          has_history: false,
        };
      })
      .filter((c) => c.score >= minScore)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        // Tie-break: has_history desc (inert until F04 populates it).
        return Number(b.has_history) - Number(a.has_history);
      })
      .slice(0, limit);

    // M7 contract (§5) puts q/limit/min_score/count at meta top-level. The
    // shared `success()` meta type is purpose-built for paginated lists, so we
    // cast this lookup-specific meta locally rather than widening the shared
    // type for one endpoint.
    const meta = {
      q,
      limit,
      min_score: minScore,
      count: scored.length,
    } as unknown as ApiSuccess<typeof scored>['meta'];
    return success(scored, meta);
  } catch (err) {
    console.error('[GET /api/qurban/muqorib/lookup] error:', err);
    const message =
      err instanceof Error && err.message
        ? `Gagal melakukan lookup muqorib: ${err.message}`
        : 'Gagal melakukan lookup muqorib.';
    return error(ErrorCodes.INTERNAL_ERROR, message, 500);
  }
}
