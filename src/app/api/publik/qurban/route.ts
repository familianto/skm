import { NextResponse } from 'next/server';
import { fetchQurbanSheets } from '@/lib/qurban-sheets';
import type { ApiResponse } from '@/types';
import type {
  QurbanPublikResponse,
  QurbanHewanItem,
  QurbanHewanSlot,
  QurbanSummary,
  QurbanPaymentInfo,
} from '@/types/qurban';

let cache: { data: QurbanPublikResponse; timestamp: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000;

interface MasterHewan {
  jenis: string;
  tipe: string;
  berat_rata2: string;
  harga_qurban: number;
  bop_per_ekor: number;
  harga_per_orang: number;
}

interface RawPeserta {
  nama: string;
  id_hewan: string;
  kode_muqorib: string;
  tipe_qurban: string;
  status_bayar: string;
}

function parseMaster(row: string[]): MasterHewan {
  return {
    jenis: row[0] || '',
    tipe: row[1] || '',
    berat_rata2: row[2] || '',
    harga_qurban: parseInt(row[3], 10) || 0,
    bop_per_ekor: parseInt(row[4], 10) || 0,
    // harga_hewan = row[5], jumlah_slot = row[6]
    harga_per_orang: parseInt(row[7], 10) || 0,
  };
}

function parseHewan(row: string[]) {
  return {
    id_hewan: row[0] || '',
    jenis: row[1] || '',
    tipe: row[2] || '',
    kuota: parseInt(row[3], 10) || 0,
  };
}

function parsePeserta(row: string[]): RawPeserta | null {
  const nama = (row[1] || '').trim();
  if (!nama) return null;
  return {
    nama,
    id_hewan: row[4] || '',
    kode_muqorib: row[5] || '',
    tipe_qurban: row[7] || '',
    status_bayar: row[8] || '',
  };
}

function parseSlotNumber(kodeMuqorib: string): number {
  const match = kodeMuqorib.match(/^(.+)-(\d+)$/);
  return match ? parseInt(match[2], 10) : 1;
}

function buildResponse(
  masterRows: string[][],
  hewanRows: string[][],
  pesertaRows: string[][],
): QurbanPublikResponse {
  const masterMap = new Map<string, MasterHewan>();
  for (const row of masterRows) {
    const m = parseMaster(row);
    masterMap.set(`${m.jenis}-${m.tipe}`, m);
  }

  const pesertaList: RawPeserta[] = [];
  for (const row of pesertaRows) {
    const p = parsePeserta(row);
    if (p) pesertaList.push(p);
  }

  const pesertaByHewan = new Map<string, RawPeserta[]>();
  for (const p of pesertaList) {
    const list = pesertaByHewan.get(p.id_hewan) || [];
    list.push(p);
    pesertaByHewan.set(p.id_hewan, list);
  }

  const hewanList: QurbanHewanItem[] = [];
  for (const row of hewanRows) {
    const h = parseHewan(row);
    if (!h.id_hewan) continue;
    const master = masterMap.get(`${h.jenis}-${h.tipe}`);
    const pesertaForHewan = pesertaByHewan.get(h.id_hewan) || [];
    const isPenitipan = pesertaForHewan.some(p => p.tipe_qurban === 'Penitipan');

    const slots: QurbanHewanSlot[] = pesertaForHewan.map(p => ({
      slot: parseSlotNumber(p.kode_muqorib),
      nama: p.nama,
      status_bayar: p.status_bayar,
      tipe_qurban: p.tipe_qurban,
    }));
    slots.sort((a, b) => a.slot - b.slot);

    hewanList.push({
      id_hewan: h.id_hewan,
      jenis: h.jenis as 'Sapi' | 'Kambing',
      tipe: h.tipe,
      berat_rata2: master?.berat_rata2 || '',
      kuota: h.kuota,
      terisi: pesertaForHewan.length,
      is_penitipan: isPenitipan,
      harga_per_orang: master?.harga_per_orang || 0,
      harga_qurban: master?.harga_qurban || 0,
      bop_per_ekor: master?.bop_per_ekor || 0,
      peserta: slots,
    });
  }

  hewanList.sort((a, b) => a.id_hewan.localeCompare(b.id_hewan));

  const sapiList = hewanList.filter(h => h.jenis === 'Sapi');
  const kambingList = hewanList.filter(h => h.jenis === 'Kambing');

  const sapiBreakdown: Record<string, number> = {};
  for (const h of sapiList) {
    sapiBreakdown[h.tipe] = (sapiBreakdown[h.tipe] || 0) + 1;
  }
  const kambingBreakdown: Record<string, number> = {};
  for (const h of kambingList) {
    kambingBreakdown[h.tipe] = (kambingBreakdown[h.tipe] || 0) + 1;
  }

  const totalLunas = pesertaList.filter(p => p.status_bayar === 'Lunas').length;

  const summary: QurbanSummary = {
    total_sapi: sapiList.length,
    total_kambing: kambingList.length,
    sapi_breakdown: sapiBreakdown,
    kambing_breakdown: kambingBreakdown,
    sapi_penitipan: sapiList.filter(h => h.is_penitipan).length,
    kambing_penitipan: kambingList.filter(h => h.is_penitipan).length,
    total_muqorib: pesertaList.length,
    total_lunas: totalLunas,
    total_belum: pesertaList.length - totalLunas,
  };

  const payment: QurbanPaymentInfo = {
    bank_name: process.env.QURBAN_PAYMENT_BANK_NAME || 'BSI',
    account_number: process.env.QURBAN_PAYMENT_ACCOUNT_NUMBER || '',
    account_holder: process.env.QURBAN_PAYMENT_ACCOUNT_HOLDER || '',
    panitia_hp: process.env.QURBAN_PANITIA_HP || '',
  };

  return {
    updated_at: new Date().toISOString(),
    summary,
    hewan: hewanList,
    payment,
  };
}

export async function GET() {
  try {
    if (cache && Date.now() - cache.timestamp < CACHE_TTL) {
      return NextResponse.json<ApiResponse<QurbanPublikResponse>>(
        { success: true, data: cache.data },
        {
          headers: {
            'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60',
          },
        },
      );
    }

    const { masterRows, hewanRows, pesertaRows } = await fetchQurbanSheets();
    const data = buildResponse(masterRows, hewanRows, pesertaRows);

    cache = { data, timestamp: Date.now() };

    return NextResponse.json<ApiResponse<QurbanPublikResponse>>(
      { success: true, data },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60',
        },
      },
    );
  } catch (error) {
    console.error('GET /api/publik/qurban error:', error);
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Gagal mengambil data Qurban.' },
      { status: 500 },
    );
  }
}
