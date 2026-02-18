'use client';

function Bone({ className = '' }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded bg-zinc-200 ${className}`}
    />
  );
}

export function TableSkeleton({
  rows = 5,
  columns = 6,
}: {
  rows?: number;
  columns?: number;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
      {/* Header */}
      <div className="flex gap-4 border-b border-zinc-100 bg-zinc-50 px-4 py-3">
        {Array.from({ length: columns }).map((_, i) => (
          <Bone key={i} className="h-3 flex-1" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          className="flex gap-4 border-b border-zinc-50 px-4 py-3.5"
        >
          {Array.from({ length: columns }).map((_, c) => (
            <Bone key={c} className="h-3.5 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function KpiCardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm"
        >
          <Bone className="h-10 w-10 shrink-0 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Bone className="h-6 w-16" />
            <Bone className="h-3 w-24" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function DetailCardSkeleton({ lines = 5 }: { lines?: number }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white shadow-sm">
      <div className="border-b border-zinc-100 px-5 py-3">
        <Bone className="h-4 w-32" />
      </div>
      <div className="space-y-3 p-5">
        {Array.from({ length: lines }).map((_, i) => (
          <div key={i} className="flex items-center justify-between gap-4">
            <Bone className="h-3 w-24" />
            <Bone className="h-3 w-32" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="space-y-6">
      <Bone className="h-7 w-48" />
      <div className="flex gap-3">
        <Bone className="h-10 w-64" />
        <Bone className="h-10 w-36" />
      </div>
      <TableSkeleton />
    </div>
  );
}
