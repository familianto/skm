import { cn } from '@/lib/utils';

interface SummaryCardProps {
  title: string;
  value: string;
  icon: string;
  color: 'green' | 'red' | 'blue' | 'gray';
  subtitle?: string;
}

const colorStyles = {
  green: {
    bg: 'bg-emerald-50',
    icon: 'text-emerald-600',
    value: 'text-emerald-700',
  },
  red: {
    bg: 'bg-red-50',
    icon: 'text-red-600',
    value: 'text-red-700',
  },
  blue: {
    bg: 'bg-blue-50',
    icon: 'text-blue-600',
    value: 'text-blue-700',
  },
  gray: {
    bg: 'bg-gray-50',
    icon: 'text-gray-600',
    value: 'text-gray-900',
  },
};

export function SummaryCard({ title, value, icon, color, subtitle }: SummaryCardProps) {
  const style = colorStyles[color];
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm text-gray-500">{title}</p>
          <p className={cn('text-2xl font-bold mt-1', style.value)}>{value}</p>
          {subtitle && <p className="text-xs text-gray-400 mt-1">{subtitle}</p>}
        </div>
        <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center text-lg', style.bg, style.icon)}>
          {icon}
        </div>
      </div>
    </div>
  );
}
