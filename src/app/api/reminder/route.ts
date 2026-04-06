import { NextRequest, NextResponse } from 'next/server';
import { sheetsService } from '@/lib/google-sheets';
import { SHEET_NAMES, SHEET_HEADERS, ID_PREFIXES } from '@/lib/constants';
import { logAudit } from '@/lib/audit';
import { reminderCreateSchema } from '@/lib/validators';
import { AuditAksi, ReminderTipe, ReminderStatus, DonaturKelompok } from '@/types';
import type { ApiResponse, Reminder, Donatur } from '@/types';
import { nowISO } from '@/lib/utils';
import { sendWhatsApp } from '@/lib/fonnte';

function rowToReminder(row: string[]): Reminder {
  const headers = SHEET_HEADERS[SHEET_NAMES.REMINDER];
  const obj: Record<string, string> = {};
  headers.forEach((h, i) => { obj[h] = row[i] || ''; });
  return {
    ...obj,
    tipe: obj.tipe as ReminderTipe,
    status: obj.status as ReminderStatus,
  } as unknown as Reminder;
}

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

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const donaturId = searchParams.get('donatur_id');

    const rows = await sheetsService.getRows(SHEET_NAMES.REMINDER);
    let reminders = rows.map(rowToReminder);

    if (donaturId) {
      reminders = reminders.filter((r) => r.donatur_id === donaturId);
    }

    // Sort by created_at descending
    reminders.sort((a, b) => b.created_at.localeCompare(a.created_at));

    return NextResponse.json<ApiResponse<Reminder[]>>(
      { success: true, data: reminders, meta: { total: reminders.length } }
    );
  } catch (error) {
    console.error('GET /api/reminder error:', error);
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Gagal mengambil data reminder.' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = reminderCreateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { donatur_id, tipe, pesan } = parsed.data;

    // Get donatur data for phone number
    const donaturResult = await sheetsService.getRowById(SHEET_NAMES.DONATUR, donatur_id);
    if (!donaturResult) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Donatur tidak ditemukan.' },
        { status: 404 }
      );
    }

    const donatur = rowToDonatur(donaturResult.row);
    if (!donatur.telepon) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Donatur tidak memiliki nomor telepon.' },
        { status: 400 }
      );
    }

    // Send WhatsApp message
    const waResult = await sendWhatsApp({ target: donatur.telepon, message: pesan });

    const id = await sheetsService.getNextId(ID_PREFIXES.REMINDER);
    const now = nowISO();
    const status = waResult.success ? ReminderStatus.TERKIRIM : ReminderStatus.GAGAL;

    await sheetsService.appendRow(SHEET_NAMES.REMINDER, [
      id, donatur_id, tipe, pesan, donatur.telepon,
      status, waResult.detail, now, now,
    ]);

    await logAudit(AuditAksi.CREATE, SHEET_NAMES.REMINDER, id,
      JSON.stringify({ donatur: donatur.nama, tipe, status, mock: waResult.mock }),
      'Bendahara'
    );

    const reminder: Reminder = {
      id, donatur_id, tipe, pesan, nomor_tujuan: donatur.telepon,
      status, response: waResult.detail, sent_at: now, created_at: now,
    };

    return NextResponse.json<ApiResponse<Reminder>>(
      { success: true, data: reminder },
      { status: 201 }
    );
  } catch (error) {
    console.error('POST /api/reminder error:', error);
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Gagal mengirim reminder.' },
      { status: 500 }
    );
  }
}
