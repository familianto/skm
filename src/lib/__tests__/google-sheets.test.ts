import { test } from 'node:test';
import assert from 'node:assert/strict';

import { sheetsService } from '../google-sheets';

/**
 * Tes `batchUpdateRanges` helper (F5b A2).
 *
 * Stub `(sheetsService as any).sheets` dengan mock client `spreadsheets.values.batchUpdate`
 * untuk verifikasi:
 *   - 1 HTTP call dipanggil (atomik).
 *   - `data[].range` benar (A1 notation berdasarkan panjang values).
 *   - `data[].values` adalah array-of-array string.
 *   - Empty updates → no-op (0 call).
 *
 * Sandbox: stub di-restore via `beforeEach`/`afterEach` style (set null setelah
 * pakai) supaya tes lain yang mengakses `sheetsService` (kalau ada) tidak
 * terdampak.
 */

type Capture = { calls: Array<{ spreadsheetId: string; requestBody: { valueInputOption: string; data: Array<{ range: string; values: string[][] }> } }> };

function installMock(): Capture {
  const capture: Capture = { calls: [] };
  const fakeClient = {
    spreadsheets: {
      values: {
        batchUpdate: async (req: { spreadsheetId: string; requestBody: Capture['calls'][number]['requestBody'] }) => {
          capture.calls.push({
            spreadsheetId: req.spreadsheetId,
            requestBody: req.requestBody,
          });
          return { data: {} };
        },
      },
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (sheetsService as any).sheets = fakeClient;
  return capture;
}

function clearMock(): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (sheetsService as any).sheets = null;
}

test('batchUpdateRanges: empty array → no-op (0 HTTP call)', async () => {
  const cap = installMock();
  try {
    await sheetsService.batchUpdateRanges([]);
    assert.equal(cap.calls.length, 0);
  } finally {
    clearMock();
  }
});

test('batchUpdateRanges: 3 update lintas-sheet → 1 HTTP call dengan 3 entry data[]', async () => {
  const cap = installMock();
  try {
    await sheetsService.batchUpdateRanges([
      { sheetName: 'qurban_peserta', rowIndex: 5, values: new Array(17).fill('x') },
      { sheetName: 'qurban_daftar_hewan', rowIndex: 10, values: new Array(17).fill('y') },
      { sheetName: 'qurban_edisi', rowIndex: 2, values: new Array(13).fill('z') },
    ]);
    assert.equal(cap.calls.length, 1, 'harus 1 HTTP call');
    const req = cap.calls[0].requestBody;
    assert.equal(req.valueInputOption, 'RAW');
    assert.equal(req.data.length, 3);

    // qurban_peserta (17 cols) → A..Q
    assert.equal(req.data[0].range, 'qurban_peserta!A5:Q5');
    assert.equal(req.data[0].values.length, 1);
    assert.equal(req.data[0].values[0].length, 17);

    // qurban_daftar_hewan (17 cols) → A..Q
    assert.equal(req.data[1].range, 'qurban_daftar_hewan!A10:Q10');

    // qurban_edisi (13 cols) → A..M
    assert.equal(req.data[2].range, 'qurban_edisi!A2:M2');
    assert.equal(req.data[2].values[0].length, 13);
  } finally {
    clearMock();
  }
});

test('batchUpdateRanges: values dengan number/boolean dikonversi ke string', async () => {
  const cap = installMock();
  try {
    await sheetsService.batchUpdateRanges([
      { sheetName: 'qurban_peserta', rowIndex: 2, values: ['PST-1', 42, true, '', null as unknown as string] },
    ]);
    const cells = cap.calls[0].requestBody.data[0].values[0];
    assert.equal(cells[0], 'PST-1');
    assert.equal(cells[1], '42');
    assert.equal(cells[2], 'true');
    assert.equal(cells[3], '');
    assert.equal(cells[4], ''); // null → ''
  } finally {
    clearMock();
  }
});

test('batchUpdateRanges: 27 kolom → AA notation', async () => {
  const cap = installMock();
  try {
    // 27 cells → kolom A..AA (index 0..26 → letter A..AA)
    const values = new Array(27).fill('v');
    await sheetsService.batchUpdateRanges([
      { sheetName: 'qurban_peserta', rowIndex: 3, values },
    ]);
    assert.equal(cap.calls[0].requestBody.data[0].range, 'qurban_peserta!A3:AA3');
  } finally {
    clearMock();
  }
});
