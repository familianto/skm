import { google } from 'googleapis';

const QURBAN_SHEET_NAMES = {
  MASTER_HEWAN: 'master_hewan',
  DAFTAR_HEWAN: 'daftar_hewan',
  PESERTA: 'peserta',
} as const;

let sheetsClient: ReturnType<typeof google.sheets> | null = null;

async function getClient() {
  if (sheetsClient) return sheetsClient;

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });

  sheetsClient = google.sheets({ version: 'v4', auth });
  return sheetsClient;
}

export async function fetchQurbanSheets(): Promise<{
  masterRows: string[][];
  hewanRows: string[][];
  pesertaRows: string[][];
}> {
  const client = await getClient();
  const spreadsheetId = process.env.GOOGLE_SHEETS_QURBAN_ID;

  if (!spreadsheetId) {
    throw new Error('GOOGLE_SHEETS_QURBAN_ID is not set');
  }

  const response = await client.spreadsheets.values.batchGet({
    spreadsheetId,
    ranges: [
      `${QURBAN_SHEET_NAMES.MASTER_HEWAN}!A2:ZZ`,
      `${QURBAN_SHEET_NAMES.DAFTAR_HEWAN}!A2:ZZ`,
      `${QURBAN_SHEET_NAMES.PESERTA}!A2:ZZ`,
    ],
  });

  const ranges = response.data.valueRanges || [];
  return {
    masterRows: (ranges[0]?.values as string[][]) || [],
    hewanRows: (ranges[1]?.values as string[][]) || [],
    pesertaRows: (ranges[2]?.values as string[][]) || [],
  };
}
