'use client';

import type { ReactNode } from 'react';

type ReportHeaderStat = {
  label: string;
  value: string | number;
};

type ReportHeaderProps = {
  title: string;
  subtitle: string;
  restaurantName: string;
  stats?: ReportHeaderStat[];
  rightSlot?: ReactNode;
};

function getInitials(name: string): string {
  const parts = name
    .split(' ')
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return 'SF';
  const initials = parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('');
  return initials || 'SF';
}

export function ReportHeader({
  title,
  subtitle,
  restaurantName,
  stats,
  rightSlot,
}: ReportHeaderProps) {
  const initials = getInitials(restaurantName);

  return (
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-zinc-200 pb-4 mb-4">
      <div className="flex items-center gap-3 min-w-[200px]">
        <div className="w-9 h-9 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-xs font-bold">
          {initials}
        </div>
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-400 truncate">
            {restaurantName}
          </div>
          <div className="text-sm font-semibold text-zinc-900">{title}</div>
          <div className="text-xs text-zinc-500">{subtitle}</div>
        </div>
      </div>

      {stats && stats.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-2 text-right">
          {stats.map((stat) => (
            <div key={stat.label} className="min-w-[90px]">
              <div className="text-[10px] uppercase tracking-wide text-zinc-400">
                {stat.label}
              </div>
              <div className="text-sm font-semibold text-zinc-900">{stat.value}</div>
            </div>
          ))}
        </div>
      )}

      {rightSlot && <div className="ml-auto">{rightSlot}</div>}
    </div>
  );
}
