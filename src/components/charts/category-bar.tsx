'use client';

import { formatRupiah } from '@/lib/utils';

export interface CategoryBarItem {
  kategori_id: string;
  nama: string;
  jumlah: number;
  persentase: number;
}

interface CategoryBarChartProps {
  data: CategoryBarItem[];
  color: 'green' | 'red';
}

export function CategoryBarChart({ data, color }: CategoryBarChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
        Belum ada data
      </div>
    );
  }

  const maxValue = Math.max(...data.map(d => d.jumlah));
  const barBg = color === 'green' ? 'bg-emerald-500' : 'bg-red-500';
  const barBgLight = color === 'green' ? 'bg-emerald-100' : 'bg-red-100';

  return (
    <div className="space-y-3">
      {data.map((item) => {
        const width = maxValue > 0 ? (item.jumlah / maxValue) * 100 : 0;
        return (
          <div key={item.kategori_id}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-gray-700 truncate max-w-[60%]">{item.nama}</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">{item.persentase}%</span>
                <span className="text-sm font-medium text-gray-900">{formatRupiah(item.jumlah)}</span>
              </div>
            </div>
            <div className={`h-2 rounded-full ${barBgLight}`}>
              <div
                className={`h-2 rounded-full ${barBg} transition-all duration-500`}
                style={{ width: `${Math.max(width, 1)}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
