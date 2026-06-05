import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  renderKartuPdf,
  renderLabelPdf,
} from '@/lib/qurban/export-render-kartu';
import type { Kartu, LabelItem } from '@/lib/qurban/export-kartu';
import type { ExportDocMeta } from '@/lib/qurban/export-render-tabel';

/**
 * Renderer Kartu/Label PDF (F8 polish G) — smoke multi-halaman: pastikan
 * pembuatan banyak halaman + pass-kedua footer (`stampFooters`) tidak melempar
 * dan menghasilkan PDF non-kosong. (Isi visual diverifikasi lapangan.)
 */

const meta: ExportDocMeta = {
  title: 'Kartu Pemotongan',
  edisiNama: '1447 H',
  masjidName: 'Masjid Uji',
  generatedAt: new Date('2026-06-05T03:00:00.000Z'),
};

function sapiKartu(n: number): Kartu[] {
  return Array.from({ length: n }, (_, i) => ({
    no_urut: i + 1,
    hewan_id: `S${i + 1}`,
    label_hewan: `SAPI A-${String(i + 1).padStart(2, '0')}`,
    jenis: 'SAPI',
    kelas: 'A',
    kapasitas: 7,
    slots: Array.from({ length: 7 }, (_, s) => ({ slot: s + 1, nama: s < 3 ? `Peserta ${s + 1}` : '' })),
  }));
}

function kambingKartu(n: number): Kartu[] {
  return Array.from({ length: n }, (_, i) => ({
    no_urut: i + 1,
    hewan_id: `K${i + 1}`,
    label_hewan: `KAMBING A-${String(i + 1).padStart(2, '0')}`,
    jenis: 'KAMBING',
    kelas: 'A',
    kapasitas: 1,
    slots: [{ slot: 1, nama: `Peserta ${i + 1}` }],
  }));
}

test('renderKartuPdf Sapi multi-halaman (28 kartu → 4 hal) tidak crash & non-kosong', () => {
  const buf = renderKartuPdf(sapiKartu(28), meta, 'SAPI');
  assert.ok(buf.byteLength > 0);
});

test('renderKartuPdf Kambing ringkas multi-halaman (40 kartu → 3 hal @18) non-kosong', () => {
  const buf = renderKartuPdf(kambingKartu(40), { ...meta, title: 'Kartu Pemotongan Kambing' }, 'KAMBING');
  assert.ok(buf.byteLength > 0);
});

test('renderKartuPdf kosong → tetap PDF valid', () => {
  const buf = renderKartuPdf([], meta, 'SAPI');
  assert.ok(buf.byteLength > 0);
});

test('renderLabelPdf multi-halaman (50 label → 3 hal @24) non-kosong', () => {
  const labels: LabelItem[] = Array.from({ length: 50 }, (_, i) => ({
    atas_nama: `Peserta ${i + 1}`,
    label_hewan: `SAPI A-${String((i % 9) + 1).padStart(2, '0')}`,
    no_urut: (i % 9) + 1,
    rt: '01',
  }));
  const buf = renderLabelPdf(labels, { ...meta, title: 'Label Bagikan' });
  assert.ok(buf.byteLength > 0);
});
