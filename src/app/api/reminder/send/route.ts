import { NextRequest, NextResponse } from 'next/server';
import { sheetsService } from '@/lib/google-sheets';
import { SHEET_NAMES, SHEET_HEADERS, ID_PREFIXES } from '@/lib/constants';
import { logAudit } from '@/lib/audit';
import { reminderBulkSchema } from '@/lib/validators';
import { AuditAksi, ReminderTipe, ReminderStatus, DonaturKelompok } from '@/types';
import type { ApiResponse, Reminder, Donatur } from '@/types';
import { nowISO } from '@/lib/utils';
import { sendWhatsApp, getFonnteStatus } from '@/lib/fonnte';

function rowToDonatur(row: string[]): Donatur {
  const headers = SHEET_HEADERS[SHEET_NAMES.DONATUR];
  const obj: Record<string, string> = {};
  headers.forEach((h, i) => { obj[h] = row[i] || ''; });
  return {
    ...obj,
    kelompok: obj.kelompok as DonaturKelompok,
    jumlah_komitmen: parseInt(obj.jumlah_komitmen, 10) || 0,
    is_active: obj.is_active === 'TRUE',
  } as unknown as Donatur;
}

/**
 * POST /api/reminder/send — Bulk send reminders to multiple donatur
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = reminderBulkSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { donatur_ids, tipe, pesan } = parsed.data;

    // Get all donatur data
    const allRows = await sheetsService.getRows(SHEET_NAMES.DONATUR);
    const allDonaturs = allRows.map(rowToDonatur);
    const selectedDonaturs = allDonaturs.filter((d) => donatur_ids.includes(d.id) && d.is_active);

    if (selectedDonaturs.length === 0) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Tidak ada donatur aktif yang dipilih.' },
        { status: 400 }
      );
    }

    const results: Reminder[] = [];
    const now = nowISO();

    for (const donatur of selectedDonaturs) {
      if (!donatur.telepon) continue;

      // Personalize message
      const personalizedMessage = pesan.replace(/\{nama\}/g, donatur.nama);

      const waResult = await sendWhatsApp({ target: donatur.telepon, message: personalizedMessage });
      const id = await sheetsService.getNextId(ID_PREFIXES.REMINDER);
      const status = waResult.success ? ReminderStatus.TERKIRIM : ReminderStatus.GAGAL;

      await sheetsService.appendRow(SHEET_NAMES.REMINDER, [
        id, donatur.id, tipe, personalizedMessage, donatur.telepon,
        status, waResult.detail, now, now,
      ]);

      results.push({
        id, donatur_id: donatur.id, tipe: tipe as ReminderTipe, pesan: personalizedMessage,
        nomor_tujuan: donatur.telepon, status, response: waResult.detail,
        sent_at: now, created_at: now,
      });
    }

    await logAudit(AuditAksi.CREATE, SHEET_NAMES.REMINDER, 'BULK',
      JSON.stringify({
        total: results.length,
        terkirim: results.filter((r) => r.status === ReminderStatus.TERKIRIM).length,
        gagal: results.filter((r) => r.status === ReminderStatus.GAGAL).length,
      }),
      'Bendahara'
    );

    return NextResponse.json<ApiResponse<Reminder[]>>(
      { success: true, data: results, meta: { total: results.length } },
      { status: 201 }
    );
  } catch (error) {
    console.error('POST /api/reminder/send error:', error);
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Gagal mengirim reminder massal.' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/reminder/send — Get Fonnte connection status
 */
export async function GET() {
  const status = getFonnteStatus();
  return NextResponse.json<ApiResponse<{ connected: boolean; mock: boolean }>>(
    { success: true, data: status }
  );
}
