# Arsitektur Sistem — SKM v2.1

## Diagram Arsitektur

```
┌─────────────────────────────────────────────────────────────┐
│                        CLIENT (Browser)                      │
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │ Dashboard│  │Transaksi │  │ Laporan  │  │  Setting │    │
│  │   Page   │  │   Page   │  │   Page   │  │   Page   │    │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘    │
│       │              │              │              │          │
│  ┌────▼──────────────▼──────────────▼──────────────▼────┐    │
│  │                    SWR / fetch                        │    │
│  │              (Client-side caching & revalidation)     │    │
│  └────────────────────────┬──────────────────────────────┘    │
└───────────────────────────┼──────────────────────────────────┘
                            │ HTTPS
┌───────────────────────────▼──────────────────────────────────┐
│                     NEXT.JS (Vercel)                          │
│                                                               │
│  ┌─────────────────────────────────────────────────────┐     │
│  │                    MIDDLEWARE                        │     │
│  │            (PIN Auth check on protected routes)      │     │
│  └────────────────────────┬────────────────────────────┘     │
│                           │                                   │
│  ┌────────────────────────▼────────────────────────────┐     │
│  │                  API ROUTE HANDLERS                  │     │
│  │                                                      │     │
│  │  /api/auth/*          /api/transaksi/*               │     │
│  │  /api/kategori/*      /api/rekening/*                │     │
│  │  /api/dashboard/*     /api/rekonsiliasi/*            │     │
│  │  /api/upload/*        /api/export/*                  │     │
│  │  /api/master/*                                       │     │
│  └──────┬───────────────────────────────┬──────────────┘     │
│         │                               │                     │
│  ┌──────▼───────────────────────────────────────────────┐     │
│  │ lib/google-sheets.ts                                │     │
│  │                                                      │     │
│  │ - getRows()      - appendRow()    - batchGet()      │     │
│  │ - updateRow()    - deleteRow()    - getRowById()    │     │
│  └──────┬───────────────────────────────────────────────┘     │
└─────────┼────────────────────────────────────────────────────┘
          │
          ▼
┌──────────────────┐
│  Google Sheets   │
│  API v4          │
│                  │
│  Spreadsheet:    │    Logo & bukti transaksi disimpan
│  - master        │    sebagai base64 data URL langsung
│  - transaksi     │    di cell Google Sheets (kolom
│  - kategori      │    logo_url dan bukti_url).
│  - rekening_bank │
│  - audit_log     │    Gambar di-resize & compress
│  - anggota       │    client-side via Canvas API
│  - rekonsiliasi  │    sebelum disimpan.
└──────────────────┘
```

## Layer Architecture

### 1. Presentation Layer

**Teknologi**: Next.js App Router + React + Tailwind CSS

```
app/
  layout.tsx                    # Root layout (global providers, font)
  (auth)/
    login/page.tsx              # Halaman login PIN
  (dashboard)/
    layout.tsx                  # Dashboard layout (sidebar + header)
    page.tsx                    # Dashboard utama (ringkasan + grafik)
    transaksi/
      page.tsx                  # Daftar transaksi (filter, pagination)
      [id]/page.tsx             # Detail transaksi
      baru/page.tsx             # Form tambah transaksi
    kategori/
      page.tsx                  # Daftar & kelola kategori
    rekening/
      page.tsx                  # Daftar & kelola rekening bank
    rekonsiliasi/
      page.tsx                  # Halaman rekonsiliasi bank
    laporan/
      page.tsx                  # Laporan & export (PDF/Excel)
    pengaturan/
      page.tsx                  # Settings (master data, PIN, logo)
```

### 2. API Layer

**Teknologi**: Next.js Route Handlers (app/api/)

Setiap route handler:
1. Validasi input dengan Zod
2. Check auth via middleware
3. Panggil service layer (`lib/`)
4. Return response format standar
5. Log ke audit_log jika write operation

```typescript
// Standard response format
type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: string;
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
  };
};
```

### 3. Service Layer

**File utama**: `lib/google-sheets.ts`

Ini adalah **satu-satunya entry point** untuk akses Google Sheets. Semua route handler HARUS menggunakan fungsi dari file ini.

```typescript
// lib/google-sheets.ts — Core functions
class GoogleSheetsService {
  // Read operations
  getRows(sheetName: string, range?: string): Promise<any[][]>
  getRowById(sheetName: string, id: string): Promise<any[] | null>

  // Write operations
  appendRow(sheetName: string, values: any[]): Promise<void>
  updateRow(sheetName: string, rowIndex: number, values: any[]): Promise<void>

  // Batch operations
  batchGet(ranges: string[]): Promise<any[][][]>

  // Utility
  getNextId(prefix: string): Promise<string>
  findRowIndex(sheetName: string, id: string): Promise<number>
}
```

**Catatan**: `lib/google-drive.ts` masih ada di codebase tapi **tidak digunakan** untuk upload logo/bukti. Logo dan bukti disimpan sebagai base64 data URL langsung di cell Google Sheets. Gambar di-resize client-side via Canvas API sebelum dikirim ke API.

### 4. Data Layer

**Google Sheets** sebagai database relasional sederhana.
- Setiap sheet = 1 tabel
- Row 1 = header (column names)
- Row 2+ = data
- Relasi via ID string (manual join di application layer)

Lihat `DATABASE_SCHEMA.md` untuk detail schema setiap sheet.

## Authentication Flow

```
┌──────────┐     ┌───────────┐     ┌──────────────┐     ┌──────────────┐
│  Client   │     │ API Route │     │ lib/auth.ts  │     │ Google Sheet │
│  (Login)  │     │ /api/auth │     │              │     │  (master)    │
└─────┬─────┘     └─────┬─────┘     └──────┬───────┘     └──────┬───────┘
      │                  │                  │                     │
      │  POST /login     │                  │                     │
      │  {pin: "1234"}   │                  │                     │
      │─────────────────▶│                  │                     │
      │                  │  hashPin(pin)    │                     │
      │                  │─────────────────▶│                     │
      │                  │                  │  getRow("master")   │
      │                  │                  │────────────────────▶│
      │                  │                  │  pin_hash           │
      │                  │                  │◀────────────────────│
      │                  │  compare hash    │                     │
      │                  │◀─────────────────│                     │
      │                  │                  │                     │
      │  Set-Cookie:     │                  │                     │
      │  session=...     │                  │                     │
      │◀─────────────────│                  │                     │
      │                  │                  │                     │
```

### Auth Details

1. **Login**: User masukkan PIN → hash → bandingkan dengan `pin_hash` di sheet `master`
2. **Session**: HTTP-only cookie dengan encrypted session token
3. **Middleware**: Check cookie di setiap request ke route yang protected
4. **Logout**: Hapus cookie
5. **No username**: PIN-only karena masjid biasanya share device, dan simplicity

## Data Flow: Buat Transaksi

```
1. User isi form transaksi (tanggal, jenis, kategori, jumlah, deskripsi, rekening)
2. (Opsional) User upload foto bukti
3. Client submit form
4. API Route menerima request
5. Validasi input dengan Zod schema
6. Jika ada bukti: upload terpisah via Canvas resize → base64 data URL → simpan di cell sheet
7. Generate ID baru (TRX-YYYYMMDD-XXXX)
8. Append row ke sheet `transaksi`
9. Append row ke sheet `audit_log` (aksi: CREATE)
10. Return response ke client
11. SWR revalidate → refresh daftar transaksi
```

## Design Decisions

| Keputusan | Alasan |
|---|---|
| Google Sheets sebagai DB | Gratis, familiar bagi pengguna non-teknis, mudah dilihat langsung |
| PIN auth (bukan OAuth) | Simplicity, cocok untuk shared device di masjid |
| SWR untuk caching | Auto-revalidation, stale-while-revalidate pattern cocok untuk data sheets |
| Next.js App Router | Modern, built-in API routes, server components, Vercel hosting |
| Tailwind CSS | Rapid UI development, mobile-first, small bundle |
| Single service layer | Mencegah scattered Google Sheets API calls, mudah di-mock untuk testing |
| Integer untuk uang | Menghindari floating point issues, Rupiah tidak ada desimal |
| Zod untuk validasi | Type-safe, composable, works di server dan client |

## Error Handling Strategy

### API Routes

```typescript
// Consistent error handling pattern
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validated = schema.parse(body); // Zod validation

    const result = await sheetsService.appendRow('transaksi', [...]);

    return Response.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ success: false, error: 'Validasi gagal', details: error.errors }, { status: 400 });
    }
    console.error('API Error:', error);
    return Response.json({ success: false, error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
```

### Client-side

- React Error Boundary untuk component-level errors
- SWR `onError` callback untuk data fetching errors
- Toast notifications untuk user feedback
- Loading states untuk async operations

## Performance Considerations

1. **Batch reads**: Gunakan `batchGet()` untuk membaca beberapa sheet sekaligus (1 API call vs N calls)
2. **SWR caching**: Data di-cache di client, revalidate on focus/interval
3. **Image resize & compress**: Bukti di-resize max 600px, logo max 200px, compress ke JPEG via Canvas API client-side, simpan sebagai base64 data URL di cell Sheets (max 50K chars per cell)
4. **Lazy loading**: Gunakan Next.js dynamic imports untuk komponen berat (charts, PDF viewer)
5. **Pagination**: Client-side pagination (semua data dibaca dari sheet, di-filter/paginate di client)
