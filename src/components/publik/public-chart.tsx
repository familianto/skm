'use client';

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { formatRupiah } from '@/lib/utils';

interface TrendItem {
  bulan: string;
  masuk: number;
  keluar: number;
}

interface PublicTrendChartProps {
  data: TrendItem[];
}

function CustomTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { value: number; name: string; color: string }[];
  label?: string;
}) {
  if (!active || !payload) return null;
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg shadow-lg p-3">
      <p className="text-sm font-medium text-white mb-1">{label}</p>
      {payload.map((entry, i) => (
        <p key={i} className="text-sm" style={{ color: entry.color }}>
          {entry.name}: {formatRupiah(entry.value)}
        </p>
      ))}
    </div>
  );
}

function formatYAxis(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(0)}jt`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}rb`;
  return value.toString();
}

export function PublicTrendChart({ data }: PublicTrendChartProps) {
  const hasData = data.some(d => d.masuk > 0 || d.keluar > 0);

  if (!hasData) {
    return (
      <div className="flex items-center justify-center h-64 text-emerald-300/50 text-sm">
        Belum ada data transaksi
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
        <XAxis
          dataKey="bulan"
          tick={{ fontSize: 12, fill: 'rgba(255,255,255,0.7)' }}
          axisLine={{ stroke: 'rgba(255,255,255,0.2)' }}
        />
        <YAxis
          tickFormatter={formatYAxis}
          tick={{ fontSize: 12, fill: 'rgba(255,255,255,0.7)' }}
          axisLine={{ stroke: 'rgba(255,255,255,0.2)' }}
        />
        <Tooltip content={<CustomTooltip />} />
        <Bar dataKey="masuk" name="Pemasukan" fill="#6ee7b7" radius={[4, 4, 0, 0]} />
        <Bar dataKey="keluar" name="Pengeluaran" fill="#fca5a5" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
