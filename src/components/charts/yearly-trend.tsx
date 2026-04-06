'use client';

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, Area, ComposedChart,
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
      {payload.filter(e => e.name !== undefined).map((entry, i) => (
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
      <ComposedChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
        <defs>
          <linearGradient id="fillMasuk" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#059669" stopOpacity={0.15} />
            <stop offset="95%" stopColor="#059669" stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="fillKeluar" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#dc2626" stopOpacity={0.15} />
            <stop offset="95%" stopColor="#dc2626" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="tahun" tick={{ fontSize: 12 }} />
        <YAxis tickFormatter={formatYAxis} tick={{ fontSize: 12 }} />
        <Tooltip content={<CustomTooltip />} />
        <Legend />
        <Area type="monotone" dataKey="masuk" name="Pemasukan" fill="url(#fillMasuk)" stroke="none" />
        <Area type="monotone" dataKey="keluar" name="Pengeluaran" fill="url(#fillKeluar)" stroke="none" />
        <Line type="monotone" dataKey="masuk" name="Pemasukan" stroke="#059669" strokeWidth={2} dot={{ r: 5, fill: '#059669' }} activeDot={{ r: 7 }} />
        <Line type="monotone" dataKey="keluar" name="Pengeluaran" stroke="#dc2626" strokeWidth={2} dot={{ r: 5, fill: '#dc2626' }} activeDot={{ r: 7 }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
