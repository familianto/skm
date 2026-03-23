import { cn } from '@/lib/utils';

const badgeVariants = {
  MASUK: 'bg-emerald-100 text-emerald-800',
  KELUAR: 'bg-red-100 text-red-800',
  AKTIF: 'bg-blue-100 text-blue-800',
  VOID: 'bg-gray-100 text-gray-800',
  SESUAI: 'bg-emerald-100 text-emerald-800',
  TIDAK_SESUAI: 'bg-red-100 text-red-800',
  BENDAHARA: 'bg-purple-100 text-purple-800',
  PENGURUS: 'bg-blue-100 text-blue-800',
  VIEWER: 'bg-gray-100 text-gray-800',
  TETAP: 'bg-blue-100 text-blue-800',
  INSIDENTAL: 'bg-gray-100 text-gray-800',
  TERKIRIM: 'bg-emerald-100 text-emerald-800',
  GAGAL: 'bg-red-100 text-red-800',
  PENDING: 'bg-amber-100 text-amber-800',
  default: 'bg-gray-100 text-gray-800',
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
