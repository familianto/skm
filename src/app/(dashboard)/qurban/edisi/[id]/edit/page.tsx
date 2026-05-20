'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

import { PageTitle } from '@/components/layout/page-title';
import { Card } from '@/components/ui/card';
import { Loading } from '@/components/ui/loading';
import { EdisiForm, type EdisiFormValues } from '@/components/qurban/EdisiForm';
import { useMe } from '@/hooks/use-me';

type EdisiStatus = 'DRAFT' | 'AKTIF' | 'SELESAI';

interface Edisi {
  id: string;
  tahun_hijriah: string;
  tahun_masehi: number;
  tanggal_idul_adha: string;
  tanggal_pendaftaran_buka: string;
  tanggal_pendaftaran_tutup: string;
  status: EdisiStatus;
}

const DRAFT_EDITABLE = [
  'tahun_hijriah',
  'tahun_masehi',
  'tanggal_idul_adha',
  'tanggal_pendaftaran_buka',
  'tanggal_pendaftaran_tutup',
];

const AKTIF_EDITABLE = [
  'tanggal_idul_adha',
  'tanggal_pendaftaran_buka',
  'tanggal_pendaftaran_tutup',
];

function editableFor(status: EdisiStatus): readonly string[] {
  if (status === 'DRAFT') return DRAFT_EDITABLE;
  if (status === 'AKTIF') return AKTIF_EDITABLE;
  return [];
}

export default function EdisiEditPage() {
  const { id } = useParams<{ id: string }>();
  const { me, loading: meLoading } = useMe();
  const [edisi, setEdisi] = useState<Edisi | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/qurban/edisi/${id}`)
      .then((r) => r.json())
      .then((json) => {
        if (json?.ok) setEdisi(json.data as Edisi);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  if (meLoading || loading) return <Loading />;

  const canWrite =
    me?.user.peran === 'SUPER_ADMIN' || me?.user.peran === 'ADMIN_QURBAN';

  if (!canWrite) {
    return (
      <div>
        <PageTitle title="Edit Edisi" />
        <Card>
          <p className="text-sm text-gray-600">
            Hanya SUPER_ADMIN dan ADMIN_QURBAN yang dapat mengedit edisi.
          </p>
        </Card>
      </div>
    );
  }

  if (!edisi) {
    return (
      <div>
        <PageTitle title="Edisi tidak ditemukan" />
        <Card>
          <p className="text-sm text-gray-600">
            Edisi ini tidak tersedia.{' '}
            <Link href="/qurban/edisi" className="text-emerald-700 hover:underline">
              Kembali ke daftar edisi
            </Link>
            .
          </p>
        </Card>
      </div>
    );
  }

  if (edisi.status === 'SELESAI') {
    return (
      <div>
        <PageTitle title={`Edit Edisi ${edisi.tahun_hijriah}`} />
        <Card>
          <p className="text-sm text-gray-600">
            Edisi sudah <strong>SELESAI</strong>. Tidak ada field yang dapat
            diubah.{' '}
            <Link
              href={`/qurban/edisi/${edisi.id}`}
              className="text-emerald-700 hover:underline"
            >
              Kembali ke detail
            </Link>
            .
          </p>
        </Card>
      </div>
    );
  }

  const editable = editableFor(edisi.status);

  const initial: EdisiFormValues = {
    tahun_hijriah: edisi.tahun_hijriah,
    tahun_masehi: String(edisi.tahun_masehi),
    tanggal_idul_adha: edisi.tanggal_idul_adha,
    tanggal_pendaftaran_buka: edisi.tanggal_pendaftaran_buka,
    tanggal_pendaftaran_tutup: edisi.tanggal_pendaftaran_tutup,
  };

  const lockHint =
    edisi.status === 'AKTIF'
      ? 'Edisi sedang AKTIF — hanya field tanggal yang dapat diubah.'
      : undefined;

  return (
    <div>
      <PageTitle
        title={`Edit Edisi ${edisi.tahun_hijriah}`}
        subtitle={`Status: ${edisi.status}`}
      />
      <EdisiForm
        mode="edit"
        edisiId={edisi.id}
        initial={initial}
        editableFields={editable}
        lockHint={lockHint}
        onSuccessRedirect={(updatedId) => `/qurban/edisi/${updatedId}`}
      />
    </div>
  );
}
