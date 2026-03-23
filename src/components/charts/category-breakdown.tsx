'use client';

import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
} from 'recharts';
import { formatRupiah } from '@/lib/utils';

interface CategoryBreakdownItem {
  kategori_id: string;
  nama: string;
  jumlah: number;
  persentase: number;
}

interface CategoryBreakdownChartProps {
  data: CategoryBreakdownItem[];
}

const COLORS = ['#059669', '#0891b2', '#7c3aed', '#ea580c', '#d97706', '#94a3b8'];

function CustomTooltip({ active, payload }: {
  active?: boolean;
  payload?: { payload: CategoryBreakdownItem }[];
}) {
  if (!active || !payload?.[0]) return null;
  const item = payload[0].payload;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3">
      <p className="text-sm font-medium text-gray-900">{item.nama}</p>
      <p className="text-sm text-gray-600">{formatRupiah(item.jumlah)}</p>
      <p className="text-sm text-gray-500">{item.persentase}%</p>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderLegend(props: any) {
  const payload = props?.payload as { value: string; color: string }[] | undefined;
  if (!payload) return null;
  return (
    <div className="flex flex-wrap gap-3 justify-center mt-2">
      {payload.map((entry: { value: string; color: string }, i: number) => (
        <div key={i} className="flex items-center gap-1.5 text-xs text-gray-600">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }} />
          <span>{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

export function CategoryBreakdownChart({ data }: CategoryBreakdownChartProps) {
  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
        Belum ada data kategori untuk ditampilkan
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="45%"
          outerRadius={100}
          innerRadius={50}
          dataKey="jumlah"
          nameKey="nama"
          paddingAngle={2}
        >
          {data.map((_, index) => (
            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip content={<CustomTooltip />} />
        <Legend content={renderLegend} />
      </PieChart>
    </ResponsiveContainer>
  );
}
