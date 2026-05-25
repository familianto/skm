import { NextRequest } from 'next/server';

import { success, error, type ApiSuccess } from '@/lib/api/response';
import { ErrorCodes } from '@/lib/api/errors';
import { requireRole } from '@/lib/api/guards';
import { PERAN } from '@/lib/api/permissions';

import { listAllMuqorib } from '@/lib/qurban/muqorib-repo';
import { maskNoHp, scoreLookupCandidate } from '@/lib/qurban/validators';

const LOOKUP_ROLES = [PERAN.SUPER_ADMIN, PERAN.ADMIN_QURBAN, PERAN.PENDAFTARAN];

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 25;
const DEFAULT_MIN_SCORE = 0.6;

/**
 * M7 — GET /api/qurban/muqorib/lookup?q=...&limit=...&min_score=...
 *
 * Smart autocomplete over ACTIVE muqorib (lintas-edisi — no edisi-context).
 * Scoring is delegated to the pure `scoreLookupCandidate`; `no_hp` is masked
 * in the response. `has_history` is a stub (always false) until F04.
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

    const qn = q.toLowerCase();

    const all = await listAllMuqorib();
    const scored = all
      .filter((m) => m.is_active)
      .map((m) => {
        const score = scoreLookupCandidate(q, qn, m);
        return {
          id: m.id,
          nama_lengkap: m.nama_lengkap,
          alamat: m.alamat,
          rt: m.rt,
          no_hp: maskNoHp(m.no_hp),
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
