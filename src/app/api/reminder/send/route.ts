import { NextRequest, NextResponse } from 'next/server';
import { sheetsService } from '@/lib/google-sheets';
import { SHEET_NAMES, SHEET_HEADERS, ID_PREFIXES } from '@/lib/constants';
import { writeAuditLog } from '@/lib/api/audit';
import { getSessionFromRequest } from '@/lib/api/auth';
import { reminderBulkSchema } from '@/lib/validators';
import { ReminderTipe, ReminderStatus, DonaturKelompok } from '@/types';
import type { ApiResponse, Reminder, ReminderBulkResult, Donatur } from '@/types';
import { nowISO } from '@/lib/utils';
import { sendWhatsApp, getDeviceStatus } from '@/lib/fonnte';
import {
  classifyTargets,
  sequentialIds,
  summarizeFailureReasons,
  REMINDER_BULK_DELAY,
  REMINDER_MAX_TARGETS_PER_REQUEST,
} from '@/lib/reminder/bulk';

/**
 * Anggaran waktu satu chunk: 50 target × ~0,5 dtk + 1 cek device ≈ 30 dtk.
 * Sengaja dipatok 60 (batas paling ketat lintas paket Vercel) supaya run
 * 4 menit seperti insiden 2026-09-03 tidak mungkin terulang diam-diam.
 */
export const maxDuration = 60;

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
 * POST /api/reminder/send — kirim reminder ke satu CHUNK donatur.
 *
 * Pelajaran insiden 2026-09-03 (287 target: 15 masuk antrean, 244 ditolak
 * "request invalid on disconnected device") diterapkan sebagai tiga pagar:
 *
 *   1. Pagar depan  — status device dicek sekali sebelum satu pesan pun dikirim.
 *   2. Fail-fast    — begitu satu kegagalan bersifat device-level, loop berhenti
 *                     dan sisa target ditandai DILEWATI, bukan GAGAL. Pada
 *                     insiden itu 244 request sia-sia ditembakkan ke device
 *                     yang sudah mati, dan justru memperkuat sinyal spam.
 *   3. Batas ukuran — maksimal REMINDER_MAX_TARGETS_PER_REQUEST target per
 *                     request; UI memecah sendiri jadi chunk.
 *
 * Penulisan `reminder_log` dilakukan SEKALI di akhir (satu `appendRows`), bukan
 * 2 panggilan Sheets per donatur seperti sebelumnya — pola lama membuat 29 dari
 * 287 baris log hilang kena kuota Sheets.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Sesi tidak ditemukan atau telah berakhir.' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const parsed = reminderBulkSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { donatur_ids, tipe, pesan } = parsed.data;

    if (donatur_ids.length > REMINDER_MAX_TARGETS_PER_REQUEST) {
      return NextResponse.json<ApiResponse<null>>(
        {
          success: false,
          error: `Maksimal ${REMINDER_MAX_TARGETS_PER_REQUEST} donatur per pengiriman. Kirim bertahap agar sesi WhatsApp tidak diputus.`,
        },
        { status: 400 }
      );
    }

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

    // ── Pagar 1: status device sebelum mengirim apa pun ──────────────────────
    const device = await getDeviceStatus();
    if (device.ok && !device.connected) {
      return NextResponse.json<ApiResponse<null>>(
        {
          success: false,
          error:
            'Device WhatsApp sedang terputus — hubungkan ulang di dashboard Fonnte, lalu coba lagi. Tidak ada pesan yang dikirim.',
        },
        { status: 503 }
      );
    }

    const classified = classifyTargets(selectedDonaturs);
    const results: Reminder[] = [];
    const rows: string[][] = [];
    const now = nowISO();

    let stopped = false;
    let stoppedReason = '';

    for (const item of classified) {
      const donatur = item.donatur;
      const personalizedMessage = pesan.replace(/\{nama\}/g, donatur.nama);

      let status_kirim: ReminderStatus;
      let detail: string;
      let target = item.target;
      let httpStatus = '';
      let fonnteId = '';

      if (!item.valid) {
        // Nomor tak valid tidak pernah dikirim — tidak membuang kuota Fonnte.
        status_kirim = ReminderStatus.GAGAL;
        detail = item.reason;
        target = '';
      } else if (stopped) {
        status_kirim = ReminderStatus.DILEWATI;
        detail = `Dihentikan: ${stoppedReason}`;
      } else {
        const waResult = await sendWhatsApp({
          target: item.target,
          message: personalizedMessage,
          delay: REMINDER_BULK_DELAY,
        });

        status_kirim = waResult.success ? ReminderStatus.TERKIRIM : ReminderStatus.GAGAL;
        detail = waResult.detail;
        target = waResult.target;
        httpStatus = waResult.httpStatus ? String(waResult.httpStatus) : '';
        fonnteId = waResult.messageId;

        // ── Pagar 2: fail-fast saat device terputus di tengah blast ─────────
        if (waResult.deviceDisconnected) {
          stopped = true;
          stoppedReason = 'device WhatsApp terputus';
          console.error(
            `[reminder/send] Device terputus saat mengirim ke ${donatur.id} — sisa target dilewati. Detail: ${detail}`
          );
        }
      }

      results.push({
        id: '', donatur_id: donatur.id, tanggal_kirim: now,
        jenis_reminder: tipe as ReminderTipe, pesan: personalizedMessage,
        status_kirim, error_message: detail, created_at: now,
        target, http_status: httpStatus, fonnte_id: fonnteId,
      });
      rows.push([
        '', donatur.id, now, tipe, personalizedMessage,
        status_kirim, detail, now, target, httpStatus, fonnteId,
      ]);
    }

    // ── Satu kali tulis ke reminder_log (dulu 2 panggilan per donatur) ───────
    let logPersisted = true;
    try {
      const firstId = await sheetsService.getNextId(ID_PREFIXES.REMINDER);
      const ids = sequentialIds(firstId, rows.length);
      ids.forEach((id, i) => {
        rows[i][0] = id;
        results[i].id = id;
      });
      await sheetsService.appendRows(SHEET_NAMES.REMINDER, rows);
    } catch (sheetError) {
      logPersisted = false;
      console.error('[reminder/send] Gagal menulis reminder_log:', sheetError);
    }

    const terkirim = results.filter((r) => r.status_kirim === ReminderStatus.TERKIRIM).length;
    const gagal = results.filter((r) => r.status_kirim === ReminderStatus.GAGAL).length;
    const dilewati = results.filter((r) => r.status_kirim === ReminderStatus.DILEWATI).length;
    const alasan = summarizeFailureReasons(
      results.filter((r) => r.status_kirim === ReminderStatus.GAGAL).map((r) => r.error_message)
    );

    // Distribusi alasan ikut masuk audit — pada insiden lalu semua detail ini
    // dibuang, menyisakan angka {total, terkirim, gagal} tanpa penyebab.
    await writeAuditLog({
      aksi: 'CREATE',
      entitas: SHEET_NAMES.REMINDER,
      entitas_id: 'BULK',
      event_type: 'reminder.bulk_send',
      after: {
        total: results.length, terkirim, gagal, dilewati, alasan,
        device: { checked: device.ok, connected: device.connected, status: device.deviceStatus },
        dihentikan: stopped ? stoppedReason : '',
        log_tersimpan: logPersisted,
      },
      notes: logPersisted ? undefined : 'reminder_log GAGAL ditulis — rincian per donatur hanya ada di audit ini.',
      user_id: session.user_id,
    });

    return NextResponse.json<ApiResponse<ReminderBulkResult>>(
      {
        success: true,
        data: {
          reminders: results,
          total: results.length,
          terkirim, gagal, dilewati,
          stopped,
          stopped_reason: stoppedReason,
          log_persisted: logPersisted,
          device_checked: device.ok,
        },
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
 * GET /api/reminder/send — status koneksi Fonnte + device.
 */
export async function GET() {
  const device = await getDeviceStatus();
  return NextResponse.json<
    ApiResponse<{ connected: boolean; mock: boolean; device_status: string; device_checked: boolean; quota: string }>
  >({
    success: true,
    data: {
      // `connected` = token Fonnte terpasang (bukan mock), dipakai badge lama.
      connected: !device.mock,
      mock: device.mock,
      device_status: device.deviceStatus,
      device_checked: device.ok,
      quota: device.quota,
    },
  });
}
