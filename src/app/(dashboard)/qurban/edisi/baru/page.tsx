'use client';

import { useEffect, useState } from 'react';

import { PageTitle } from '@/components/layout/page-title';
import { Loading } from '@/components/ui/loading';
import { EdisiForm, type EdisiCloneSource } from '@/components/qurban/EdisiForm';
import { useMe } from '@/hooks/use-me';

const EMPTY = {
  tahun_hijriah: '',
  tahun_masehi: '',
  tanggal_idul_adha: '',
  tanggal_pendaftaran_buka: '',
  tanggal_pendaftaran_tutup: '',
};

export default function EdisiBaruPage() {
  const { me, loading: meLoading } = useMe();
  const [cloneSources, setCloneSources] = useState<EdisiCloneSource[]>([]);
  const [loadingSources, setLoadingSources] = useState(true);

  useEffect(() => {
    fetch('/api/qurban/edisi')
      .then((r) => r.json())
      .then((json) => {
        if (json?.ok) {
          setCloneSources(
            (json.data as { id: string; tahun_hijriah: string }[]).map((e) => ({
              id: e.id,
              tahun_hijriah: e.tahun_hijriah,
            }))
          );
        }
      })
      .catch(() => {})
      .finally(() => setLoadingSources(false));
  }, []);

  if (meLoading || loadingSources) return <Loading />;

  const canWrite =
    me?.user.peran === 'SUPER_ADMIN' || me?.user.peran === 'ADMIN_QURBAN';

  if (!canWrite) {
    return (
      <div>
        <PageTitle title="Edisi Baru" />
        <p className="text-sm text-gray-600">
          Hanya SUPER_ADMIN dan ADMIN_QURBAN yang dapat membuat edisi baru.
        </p>
      </div>
    );
  }

  return (
    <div>
      <PageTitle
        title="Edisi Baru"
        subtitle="Buat edisi penyelenggaraan Qurban baru."
      />
      <EdisiForm
        mode="create"
        initial={EMPTY}
        cloneSources={cloneSources}
        onSuccessRedirect={(id) => `/qurban/edisi/${id}`}
      />
    </div>
  );
}
