import { getSessionFromCookieStore } from '@/lib/api/auth';
import { getEdisiContext } from '@/lib/qurban/edisi-context';
import { EditionSwitcher } from '@/components/qurban/EditionSwitcher';

/**
 * Server layout for `/qurban/**`. Resolves edisi context (reads
 * `qurban_edisi` from the Sheet in Node runtime) and renders the
 * `EditionSwitcher` strip above the page content.
 *
 * Middleware has already guaranteed session presence + role gate by the time
 * this layout runs (see `src/middleware.ts` + `lib/api/path-rules.ts`). If the
 * session is somehow absent here, fall back to an empty-state header rather
 * than crashing — the page itself will handle the redirect.
 */
export default async function QurbanLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSessionFromCookieStore();
  const peran = session?.peran ?? '';

  const ctx = peran
    ? await getEdisiContext({ peran })
    : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        {ctx ? (
          <EditionSwitcher
            current={ctx.edisi}
            available={ctx.available}
            canSwitch={ctx.canSwitch}
            reason={ctx.reason}
          />
        ) : (
          <div className="text-sm text-gray-500">Memuat edisi…</div>
        )}
      </div>
      {children}
    </div>
  );
}
