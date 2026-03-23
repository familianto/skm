import { NextResponse } from 'next/server';
import { deleteSession } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { AuditAksi } from '@/types';
import type { ApiResponse } from '@/types';

export async function POST() {
  try {
    await deleteSession();
    await logAudit(AuditAksi.LOGOUT, 'auth', '', 'Logout berhasil', 'Bendahara');

    return NextResponse.json<ApiResponse<null>>({ success: true });
  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Terjadi kesalahan saat logout.' },
      { status: 500 }
    );
  }
}
