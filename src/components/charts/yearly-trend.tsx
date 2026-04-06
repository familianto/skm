'use client';

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';
import { formatRupiah } from '@/lib/utils';

export interface YearlyTrendItem {
  tahun: string;
  masuk: number;
  keluar: number;
}

interface YearlyTrendChartProps {
  data: YearlyTrendItem[];
}

function CustomTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { value: number; name: string; color: string }[];
  label?: string;
}) {
  if (!active || !payload) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3">
      <p className="text-sm font-medium text-gray-900 mb-1">Tahun {label}</p>
      {payload.map((entry, i) => (
        <p key={i} className="text-sm" style={{ color: entry.color }}>
          {entry.name}: {formatRupiah(entry.value)}
        </p>
      ))}
    </div>
  );
}

function formatYAxis(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}M`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(0)}jt`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}rb`;
  return value.toString();
}

export function YearlyTrendChart({ data }: YearlyTrendChartProps) {
  const hasData = data.some(d => d.masuk > 0 || d.keluar > 0);

  if (!hasData) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
        Belum ada data transaksi untuk ditampilkan
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="tahun" tick={{ fontSize: 12 }} />
        <YAxis tickFormatter={formatYAxis} tick={{ fontSize: 12 }} />
        <Tooltip content={<CustomTooltip />} />
        <Legend />
        <Bar dataKey="masuk" name="Pemasukan" fill="#059669" radius={[4, 4, 0, 0]} />
        <Bar dataKey="keluar" name="Pengeluaran" fill="#dc2626" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
