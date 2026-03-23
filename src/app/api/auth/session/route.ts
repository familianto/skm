import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import type { ApiResponse, SessionData } from '@/types';

export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request);

    if (!session) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Sesi tidak valid.' },
        { status: 401 }
      );
    }

    return NextResponse.json<ApiResponse<SessionData>>(
      { success: true, data: session }
    );
  } catch (error) {
    console.error('Session check error:', error);
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Terjadi kesalahan.' },
      { status: 500 }
    );
  }
}
