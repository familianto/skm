import { cn } from '@/lib/utils';

const badgeVariants = {
  MASUK: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200',
  KELUAR: 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-200',
  MUTASI: 'bg-slate-50 text-slate-700 ring-1 ring-inset ring-slate-200',
  AKTIF: 'bg-gray-50 text-gray-600 ring-1 ring-inset ring-gray-200',
  VOID: 'bg-gray-100 text-gray-500 ring-1 ring-inset ring-gray-200',
  SESUAI: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200',
  TIDAK_SESUAI: 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-200',
  BENDAHARA: 'bg-gray-50 text-gray-600 ring-1 ring-inset ring-gray-200',
  PENGURUS: 'bg-gray-50 text-gray-600 ring-1 ring-inset ring-gray-200',
  VIEWER: 'bg-gray-50 text-gray-500 ring-1 ring-inset ring-gray-200',
  TETAP: 'bg-gray-50 text-gray-600 ring-1 ring-inset ring-gray-200',
  INSIDENTAL: 'bg-gray-50 text-gray-500 ring-1 ring-inset ring-gray-200',
  TERKIRIM: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200',
  GAGAL: 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-200',
  PENDING: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200',
  default: 'bg-gray-50 text-gray-600 ring-1 ring-inset ring-gray-200',
} as const;

interface BadgeProps {
  label: string;
  variant?: keyof typeof badgeVariants;
  className?: string;
}

export function Badge({ label, variant, className }: BadgeProps) {
  const key = variant || (label as keyof typeof badgeVariants) || 'default';
  const colors = badgeVariants[key] || badgeVariants.default;

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        colors,
        className
      )}
    >
      {label}
    </span>
  );
}
