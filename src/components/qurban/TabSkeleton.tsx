import { Card } from '@/components/ui/card';

/**
 * Shimmer placeholder rendered while a Qurban tab fetches its initial data.
 * Sized roughly to the form/table that lands next, so the layout doesn't
 * jump when the real content swaps in.
 */
function Bar({ className = '' }: { className?: string }) {
  return <div className={`bg-gray-200 rounded animate-pulse ${className}`} />;
}

export function FormSkeleton() {
  return (
    <Card>
      <div className="space-y-6">
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-3">
            <Bar className="h-4 w-40" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Bar className="h-3 w-24" />
                <Bar className="h-10 w-full" />
              </div>
              <div className="space-y-2">
                <Bar className="h-3 w-24" />
                <Bar className="h-10 w-full" />
              </div>
            </div>
          </div>
        ))}
        <div className="flex justify-end pt-2">
          <Bar className="h-10 w-32" />
        </div>
      </div>
    </Card>
  );
}

export function TableSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <Card padding={false}>
      <div className="overflow-x-auto">
        <div className="min-w-full p-4 space-y-3">
          <div className="grid grid-cols-4 gap-4">
            <Bar className="h-3 w-24" />
            <Bar className="h-3 w-20" />
            <Bar className="h-3 w-28" />
            <Bar className="h-3 w-24" />
          </div>
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="grid grid-cols-4 gap-4 py-2 border-t border-gray-100">
              <Bar className="h-4 w-32" />
              <Bar className="h-4 w-20" />
              <Bar className="h-4 w-24" />
              <Bar className="h-4 w-28" />
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
