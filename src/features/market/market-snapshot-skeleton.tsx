import { Skeleton } from "@/components/ui/skeleton";

export function MarketSnapshotSkeleton({ compact = false }: { compact?: boolean }) {
  const count = compact ? 4 : 7;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-4 w-32" />
      </div>
      <div className={`grid gap-3 ${compact ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5"}`}>
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="flex flex-col gap-2 rounded-lg border border-gt-border bg-gt-surface px-4 py-3.5">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-6 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}
