import { google, sheets_v4 } from 'googleapis';
import { SHEET_HEADERS, ID_PREFIXES } from './constants';

type SheetsApi = sheets_v4.Sheets;

class GoogleSheetsService {
  private sheets: SheetsApi | null = null;
  private spreadsheetId: string;

  constructor() {
    this.spreadsheetId = process.env.GOOGLE_SHEETS_ID || '';
  }

  /**
   * Get authenticated Google Sheets API client (lazy init, singleton)
   */
  private async getClient(): Promise<SheetsApi> {
    if (this.sheets) return this.sheets;

    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    this.sheets = google.sheets({ version: 'v4', auth });
    return this.sheets;
  }

  /**
   * Read all rows from a sheet (excluding header row)
   * Returns array of string arrays, each representing a row
   */
  async getRows(sheetName: string, range?: string): Promise<string[][]> {
    const client = await this.getClient();
    const fullRange = range || `${sheetName}!A2:ZZ`;

    const response = await client.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: fullRange,
    });

    return (response.data.values as string[][]) || [];
  }

  /**
   * Find a row by ID (first column) and return it with its row index
   */
  async getRowById(sheetName: string, id: string): Promise<{ row: string[]; rowIndex: number } | null> {
    const rows = await this.getRows(sheetName);
    const index = rows.findIndex((row) => row[0] === id);
    if (index === -1) return null;
    return { row: rows[index], rowIndex: index + 2 }; // +2 because row 1 is header, data starts at row 2
  }

  /**
   * Append a new row to a sheet
   */
  async appendRow(sheetName: string, values: (string | number | boolean)[]): Promise<void> {
    const client = await this.getClient();
    await client.spreadsheets.values.append({
      spreadsheetId: this.spreadsheetId,
      range: `${sheetName}!A:A`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [values.map((v) => String(v))],
      },
    });
  }

  /**
   * Update a specific row (by 1-based row index)
   */
  async updateRow(sheetName: string, rowIndex: number, values: (string | number | boolean)[]): Promise<void> {
    const client = await this.getClient();
    const headers = SHEET_HEADERS[sheetName];
    if (!headers) throw new Error(`Unknown sheet: ${sheetName}`);

    const lastCol = String.fromCharCode(64 + headers.length); // A=65, so 64+n
    const range = `${sheetName}!A${rowIndex}:${lastCol}${rowIndex}`;

    await client.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range,
      valueInputOption: 'RAW',
      requestBody: {
        values: [values.map((v) => String(v))],
      },
    });
  }

  /**
   * Batch get multiple ranges in a single API call
   */
  async batchGet(ranges: string[]): Promise<string[][][]> {
    const client = await this.getClient();
    const response = await client.spreadsheets.values.batchGet({
      spreadsheetId: this.spreadsheetId,
      ranges,
    });

    return (response.data.valueRanges || []).map(
      (vr) => (vr.values as string[][]) || []
    );
  }

  /**
   * Generate next sequential ID for a given prefix
   * Format: PREFIX-YYYYMMDD-XXXX
   */
  async getNextId(prefix: string): Promise<string> {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const prefixPattern = `${prefix}-${today}-`;

    // Find the sheet that uses this prefix
    const sheetName = Object.entries(ID_PREFIXES).find(
      ([, p]) => p === prefix
    )?.[0];

    if (!sheetName) throw new Error(`Unknown prefix: ${prefix}`);

    // Map prefix key to sheet name
    const sheetKey = sheetName as keyof typeof ID_PREFIXES;
    const actualSheetName = getSheetNameByPrefix(sheetKey);

    const rows = await this.getRows(actualSheetName);
    let maxCounter = 0;

    for (const row of rows) {
      const id = row[0];
      if (id && id.startsWith(prefixPattern)) {
        const counter = parseInt(id.slice(prefixPattern.length), 10);
        if (counter > maxCounter) maxCounter = counter;
      }
    }

    return `${prefixPattern}${String(maxCounter + 1).padStart(4, '0')}`;
  }

  /**
   * Find the 1-based row index for a given ID
   */
  async findRowIndex(sheetName: string, id: string): Promise<number> {
    const result = await this.getRowById(sheetName, id);
    if (!result) throw new Error(`Row not found: ${id} in ${sheetName}`);
    return result.rowIndex;
  }

  /**
   * Check if connection to Google Sheets is working
   */
  async testConnection(): Promise<boolean> {
    try {
      const client = await this.getClient();
      await client.spreadsheets.get({
        spreadsheetId: this.spreadsheetId,
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Set up header row for a sheet (if not already present)
   */
  async setupHeaders(sheetName: string): Promise<void> {
    const headers = SHEET_HEADERS[sheetName];
    if (!headers) throw new Error(`Unknown sheet: ${sheetName}`);

    const client = await this.getClient();

    // Check if headers already exist
    try {
      const response = await client.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${sheetName}!A1:A1`,
      });

      if (response.data.values && response.data.values.length > 0) {
        // Headers already exist, skip
        return;
      }
    } catch {
      // Sheet might not exist yet, proceed to write headers
    }

    await client.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range: `${sheetName}!A1`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [headers],
      },
    });
  }
}

/**
 * Map ID_PREFIXES key to actual sheet name
 */
function getSheetNameByPrefix(prefixKey: string): string {
  const mapping: Record<string, string> = {
    MASTER: 'master',
    TRANSAKSI: 'transaksi',
    KATEGORI: 'kategori',
    REKENING_BANK: 'rekening_bank',
    AUDIT_LOG: 'audit_log',
    ANGGOTA: 'anggota',
    REKONSILIASI: 'rekonsiliasi',
  };
  return mapping[prefixKey] || prefixKey.toLowerCase();
}

// Singleton instance
export const sheetsService = new GoogleSheetsService();
