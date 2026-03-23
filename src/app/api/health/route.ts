import { NextResponse } from 'next/server';
import { sheetsService } from '@/lib/google-sheets';

export async function GET() {
  try {
    const connected = await sheetsService.testConnection();

    return NextResponse.json({
      success: true,
      data: {
        status: connected ? 'ok' : 'disconnected',
        sheets_connected: connected,
        timestamp: new Date().toISOString(),
        version: '2.1.0',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      {
        success: false,
        error: `Health check failed: ${message}`,
        data: {
          status: 'error',
          sheets_connected: false,
          timestamp: new Date().toISOString(),
          version: '2.1.0',
        },
      },
      { status: 503 }
    );
  }
}
