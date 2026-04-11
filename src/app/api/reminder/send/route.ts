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
 * POST /api/reminder/send — Bulk send reminders to multiple donatur.
 *
 * Each donatur is processed independently: if logging one reminder to Google
 * Sheets fails (e.g., rate limit), the WhatsApp message was already sent so
 * we record the failure and continue with the rest. The overall request is
 * only considered a failure if *nothing* could be processed.
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
    const selectedDonaturs = allDonaturs.filter(
      (d) => donatur_ids.includes(d.id) && d.is_active && d.telepon
    );

    if (selectedDonaturs.length === 0) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Tidak ada donatur aktif dengan nomor telepon yang dipilih.' },
        { status: 400 }
      );
    }

    const results: Reminder[] = [];
    const now = nowISO();

    for (const donatur of selectedDonaturs) {
      const personalizedMessage = pesan.replace(/\{nama\}/g, donatur.nama);

      // 1. Send WhatsApp — sendWhatsApp never throws; it returns a
      //    structured SendResult on both success and failure.
      const waResult = await sendWhatsApp({
        target: donatur.telepon,
        message: personalizedMessage,
      });

      const status = waResult.success ? ReminderStatus.TERKIRIM : ReminderStatus.GAGAL;

      // 2. Persist an audit row. If Google Sheets fails here we must NOT
      //    report a send failure to the user — the WhatsApp message was
      //    already delivered (or failed) regardless of our bookkeeping.
      let id = '';
      try {
        id = await sheetsService.getNextId(ID_PREFIXES.REMINDER);
        await sheetsService.appendRow(SHEET_NAMES.REMINDER, [
          id, donatur.id, tipe, personalizedMessage, donatur.telepon,
          status, waResult.detail, now, now,
        ]);
      } catch (sheetError) {
        console.error(
          `[reminder/send] Failed to persist reminder row for donatur ${donatur.id}:`,
          sheetError
        );
        // Keep going — the message status is still reported in the response.
      }

      results.push({
        id, donatur_id: donatur.id, tipe: tipe as ReminderTipe, pesan: personalizedMessage,
        nomor_tujuan: donatur.telepon, status, response: waResult.detail,
        sent_at: now, created_at: now,
      });
    }

    const terkirim = results.filter((r) => r.status === ReminderStatus.TERKIRIM).length;
    const gagal = results.filter((r) => r.status === ReminderStatus.GAGAL).length;

    // Audit log is best-effort (logAudit already swallows its own errors).
    await logAudit(
      AuditAksi.CREATE,
      SHEET_NAMES.REMINDER,
      'BULK',
      JSON.stringify({ total: results.length, terkirim, gagal }),
      'Bendahara'
    );

    return NextResponse.json<ApiResponse<Reminder[]>>(
      {
        success: true,
        data: results,
        meta: { total: results.length },
      },
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
