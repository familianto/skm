'use client';

import { useRouter, useSearchParams } from 'next/navigation';

import { useMe } from '@/hooks/use-me';
import { cn } from '@/lib/utils';
import { canWriteMasterHewan } from '@/lib/qurban/master-hewan-display';
import { canWriteDaftarHewan } from '@/lib/qurban/daftar-hewan-display';
import { MasterTipeTab } from '@/components/qurban/MasterTipeTab';
import { HewanInventoryTab } from '@/components/qurban/HewanInventoryTab';

type EdisiStatus = 'DRAFT' | 'AKTIF' | 'SELESAI';

type TabKey = 'master' | 'inventory';
const TABS: { key: TabKey; label: string }[] = [
  { key: 'master', label: 'Master Tipe' },
  { key: 'inventory', label: 'Daftar Inventory' },
];

interface Props {
  edisiId: string;
  edisiStatus: EdisiStatus;
  edisiTahun: string;
}

/**
 * Client tab container for `/qurban/hewan`. Tab state is URL-driven
 * (`?tab=master|inventory`), mirroring the F02 edisi-detail tab pattern.
 * Must render inside a <Suspense> boundary (uses useSearchParams).
 */
export function HewanTabs({ edisiId, edisiStatus, edisiTahun }: Props) {
  const router = useRouter();
  const search = useSearchParams();
  const { me } = useMe();

  const tabFromUrl = search.get('tab') as TabKey | null;
  const activeTab: TabKey =
    tabFromUrl && (['master', 'inventory'] as TabKey[]).includes(tabFromUrl)
      ? tabFromUrl
      : 'master';

  const canEdit = canWriteMasterHewan(me?.user.peran) && edisiStatus !== 'SELESAI';
  const canEditInventory = canWriteDaftarHewan(me?.user.peran) && edisiStatus !== 'SELESAI';

  const setTab = (next: TabKey) => {
    const params = new URLSearchParams(search.toString());
    if (next === 'master') params.delete('tab');
    else params.set('tab', next);
    const qs = params.toString();
    router.replace(`/qurban/hewan${qs ? `?${qs}` : ''}`);
  };

  return (
    <div>
      <p className="text-sm text-gray-500 mb-3">
        Edisi: <span className="font-medium text-gray-700">{edisiTahun}</span>{' '}
        <span className="text-gray-400">({edisiStatus})</span>
      </p>

      <div className="flex gap-1 border-b border-gray-200 mb-4 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap',
              activeTab === t.key
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'master' && (
        <MasterTipeTab edisiId={edisiId} edisiStatus={edisiStatus} canEdit={canEdit} />
      )}

      {activeTab === 'inventory' && (
        <HewanInventoryTab edisiId={edisiId} edisiStatus={edisiStatus} canEdit={canEditInventory} />
      )}
    </div>
  );
}
