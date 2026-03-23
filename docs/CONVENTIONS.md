# Coding Conventions — SKM v2.1

## TypeScript

- **Strict mode**: Selalu aktifkan `strict: true` di tsconfig.json
- **No `any`**: Hindari `any`, gunakan `unknown` jika tipe tidak diketahui
- **Interfaces > Type aliases** untuk object shapes
- **Enums** untuk fixed values (TransactionType, TransactionStatus, UserRole)

```typescript
// ✅ Good
interface Transaksi {
  id: string;
  tanggal: string;
  jenis: TransaksiJenis;
  jumlah: number;
}

enum TransaksiJenis {
  MASUK = 'MASUK',
  KELUAR = 'KELUAR',
}

// ❌ Bad
type Transaksi = any;
```

## Naming Conventions

| Konteks | Convention | Contoh |
|---|---|---|
| File (component) | kebab-case | `transaction-form.tsx` |
| File (util/lib) | kebab-case | `google-sheets.ts` |
| Component | PascalCase | `TransactionForm` |
| Function/variable | camelCase | `getTransaksi()`, `totalMasuk` |
| Constant | UPPER_SNAKE_CASE | `MAX_FILE_SIZE`, `SHEET_NAMES` |
| API route path | kebab-case | `/api/rekening-bank` |
| Sheet column | snake_case | `nama_masjid`, `created_at` |
| CSS class | Tailwind utilities | `className="flex items-center"` |
| Type/Interface | PascalCase | `TransaksiResponse` |
| Enum | PascalCase (name), UPPER_SNAKE (values) | `TransaksiJenis.MASUK` |

## File & Directory Structure

```
app/                            # Next.js App Router pages
  (auth)/                       # Auth group (login page)
  (dashboard)/                  # Dashboard group (protected pages)
  api/                          # API route handlers
components/
  ui/                           # Generic reusable components (Button, Input, Modal, Card)
  forms/                        # Form components (TransactionForm, CategoryForm)
  charts/                       # Chart components (MonthlyTrend, CategoryBreakdown)
  layout/                       # Layout components (Sidebar, Header, PageTitle)
lib/                            # Core business logic & services
  google-sheets.ts              # Google Sheets service (SATU-SATUNYA entry point)
  google-drive.ts               # Google Drive service
  auth.ts                       # Auth helpers (hash, verify, session)
  utils.ts                      # General utilities (formatRupiah, formatDate, generateId)
  constants.ts                  # Constants (SHEET_NAMES, DEFAULT_CATEGORIES, etc.)
  validators.ts                 # Zod schemas for validation
types/
  index.ts                      # All TypeScript interfaces & enums
hooks/                          # Custom React hooks
  use-transaksi.ts              # SWR hook for transactions
  use-dashboard.ts              # SWR hook for dashboard data
  use-auth.ts                   # Auth state hook
```

## Component Patterns

### Functional Components Only

```typescript
// ✅ Good
export function TransactionCard({ transaksi }: { transaksi: Transaksi }) {
  return <div>...</div>;
}

// ❌ Bad — no class components
class TransactionCard extends React.Component { ... }
```

### Props Interface

```typescript
// Define props interface di atas component
interface TransactionListProps {
  transactions: Transaksi[];
  onSelect: (id: string) => void;
  filter?: TransaksiFilter;
}

export function TransactionList({ transactions, onSelect, filter }: TransactionListProps) {
  // ...
}
```

### Client vs Server Components

- **Default**: Server Component (no `'use client'`)
- **Use client** hanya jika perlu: useState, useEffect, event handlers, browser APIs
- **Data fetching**: Preferably di Server Component, pass sebagai props

## API Route Patterns

### Standard Route Handler

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sheetsService } from '@/lib/google-sheets';
import { logAudit } from '@/lib/audit';

const createTransaksiSchema = z.object({
  tanggal: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  jenis: z.enum(['MASUK', 'KELUAR']),
  kategori_id: z.string(),
  deskripsi: z.string().min(1),
  jumlah: z.number().int().positive(),
  rekening_id: z.string(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = createTransaksiSchema.parse(body);

    const id = await sheetsService.getNextId('TRX');
    await sheetsService.appendRow('transaksi', [id, data.tanggal, ...]);
    await logAudit('CREATE', 'transaksi', id, data);

    return NextResponse.json({ success: true, data: { id } }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Validasi gagal', details: error.errors },
        { status: 400 }
      );
    }
    console.error('[POST /api/transaksi]', error);
    return NextResponse.json(
      { success: false, error: 'Terjadi kesalahan server' },
      { status: 500 }
    );
  }
}
```

### Response Format

Selalu gunakan format ini:

```typescript
// Success
{ success: true, data: T }
{ success: true, data: T, meta: { total: 100, page: 1, limit: 20 } }

// Error
{ success: false, error: "Pesan error" }
{ success: false, error: "Validasi gagal", details: [...] }
```

## Google Sheets Access Pattern

### WAJIB melalui service layer

```typescript
// ✅ Good — via service layer
import { sheetsService } from '@/lib/google-sheets';
const rows = await sheetsService.getRows('transaksi');

// ❌ Bad — direct API call di route handler
import { google } from 'googleapis';
const sheets = google.sheets('v4');
const response = await sheets.spreadsheets.values.get({ ... });
```

### Audit Log untuk Write Operations

Setiap operasi tulis (create, update, delete, void) HARUS menulis ke `audit_log`:

```typescript
await logAudit('CREATE', 'transaksi', newId, { ...data });
```

## Git Conventions

### Commit Messages

Format: Conventional Commits

```
feat: tambah form transaksi baru
fix: perbaiki kalkulasi saldo rekening
docs: update dokumentasi API reference
chore: update dependencies
refactor: extract transaction validation ke utils
test: tambah unit test untuk generateId
style: fix formatting di dashboard page
```

### Branch Naming

```
sprint-0/setup-project
sprint-1/auth-pin
sprint-2/transaction-crud
sprint-3/dashboard-charts
```

## Testing

### Unit Tests

- Test service layer functions (`lib/google-sheets.ts`)
- Test utility functions (`lib/utils.ts`)
- Test validators (`lib/validators.ts`)
- Mock Google Sheets API responses

### Integration Tests

- Test API route handlers
- Mock service layer
- Test error handling & validation

### Component Tests

- Test form validation
- Test user interactions
- Test conditional rendering

### File Naming

```
lib/utils.ts          → lib/__tests__/utils.test.ts
lib/google-sheets.ts  → lib/__tests__/google-sheets.test.ts
```

## Formatting & Localization

### Currency

```typescript
// lib/utils.ts
function formatRupiah(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(amount);
}
// Output: "Rp 1.500.000"
```

### Date

```typescript
function formatTanggal(dateStr: string): string {
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(dateStr));
}
// Output: "23 Maret 2026"
```

### Numbers in Sheets

- Simpan sebagai integer (tanpa titik, tanpa koma)
- Format di presentation layer saja
- Contoh: `1500000` di sheet → `Rp 1.500.000` di UI
