import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge Tailwind CSS classes with clsx
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format number as Indonesian Rupiah with space: "Rp 1.234.567"
 */
export function formatRupiah(amount: number): string {
  const formatted = new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
  return `Rp ${formatted}`;
}

/**
 * Format ISO date string to Indonesian locale
 */
export function formatTanggal(date: string): string {
  return new Date(date).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * Format ISO timestamp to Indonesian locale with time
 */
export function formatTimestamp(timestamp: string): string {
  return new Date(timestamp).toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Get current ISO timestamp
 */
export function nowISO(): string {
  return new Date().toISOString();
}

/**
 * Get current date in YYYY-MM-DD format
 */
export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Parse Rupiah-formatted string to integer
 */
export function parseRupiah(input: string): number {
  const cleaned = input.replace(/[^\d-]/g, '');
  return parseInt(cleaned, 10) || 0;
}

/**
 * Paginate an array
 */
export function paginateData<T>(data: T[], page: number, limit: number): T[] {
  const start = (page - 1) * limit;
  return data.slice(start, start + limit);
}
