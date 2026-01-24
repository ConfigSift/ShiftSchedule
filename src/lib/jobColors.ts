'use client';

export type JobColorKey =
  | 'bartender'
  | 'busser'
  | 'dishwasher'
  | 'host'
  | 'kitchen'
  | 'manager'
  | 'server'
  | 'other';

export type JobColorConfig = {
  key: JobColorKey;
  label: string;
  color: string;
  bgColor: string;
  hoverBgColor: string;
  borderClass: string;
  accentClass: string;
  indicatorClass: string;
  dotClass: string;
  textClass: string;
};

const JOB_COLOR_STYLES: Record<JobColorKey, JobColorConfig> = {
  bartender: {
    key: 'bartender',
    label: 'Bartender',
    color: '#f97316',
    bgColor: 'rgba(249, 115, 22, 0.18)',
    hoverBgColor: 'rgba(249, 115, 22, 0.45)',
    borderClass: 'border-amber-500/70',
    accentClass: 'bg-amber-500/10',
    indicatorClass: 'bg-amber-500/80',
    dotClass: 'bg-amber-500',
    textClass: 'text-amber-500',
  },
  busser: {
    key: 'busser',
    label: 'Busser',
    color: '#a855f7',
    bgColor: 'rgba(168, 85, 247, 0.18)',
    hoverBgColor: 'rgba(168, 85, 247, 0.45)',
    borderClass: 'border-violet-500/70',
    accentClass: 'bg-violet-500/10',
    indicatorClass: 'bg-violet-500/80',
    dotClass: 'bg-violet-500',
    textClass: 'text-violet-500',
  },
  dishwasher: {
    key: 'dishwasher',
    label: 'Dishwasher',
    color: '#06b6d4',
    bgColor: 'rgba(6, 182, 212, 0.18)',
    hoverBgColor: 'rgba(6, 182, 212, 0.45)',
    borderClass: 'border-cyan-500/70',
    accentClass: 'bg-cyan-500/10',
    indicatorClass: 'bg-cyan-500/80',
    dotClass: 'bg-cyan-500',
    textClass: 'text-cyan-500',
  },
  host: {
    key: 'host',
    label: 'Host',
    color: '#10b981',
    bgColor: 'rgba(16, 185, 129, 0.18)',
    hoverBgColor: 'rgba(16, 185, 129, 0.45)',
    borderClass: 'border-emerald-500/70',
    accentClass: 'bg-emerald-500/10',
    indicatorClass: 'bg-emerald-500/80',
    dotClass: 'bg-emerald-500',
    textClass: 'text-emerald-500',
  },
  kitchen: {
    key: 'kitchen',
    label: 'Kitchen',
    color: '#ef4444',
    bgColor: 'rgba(239, 68, 68, 0.18)',
    hoverBgColor: 'rgba(239, 68, 68, 0.45)',
    borderClass: 'border-red-500/70',
    accentClass: 'bg-red-500/10',
    indicatorClass: 'bg-red-500/80',
    dotClass: 'bg-red-500',
    textClass: 'text-red-500',
  },
  manager: {
    key: 'manager',
    label: 'Manager',
    color: '#84cc16',
    bgColor: 'rgba(132, 204, 22, 0.18)',
    hoverBgColor: 'rgba(132, 204, 22, 0.45)',
    borderClass: 'border-lime-500/70',
    accentClass: 'bg-lime-500/10',
    indicatorClass: 'bg-lime-500/80',
    dotClass: 'bg-lime-500',
    textClass: 'text-lime-500',
  },
  server: {
    key: 'server',
    label: 'Server',
    color: '#3b82f6',
    bgColor: 'rgba(59, 130, 246, 0.18)',
    hoverBgColor: 'rgba(59, 130, 246, 0.45)',
    borderClass: 'border-blue-500/70',
    accentClass: 'bg-blue-500/10',
    indicatorClass: 'bg-blue-500/80',
    dotClass: 'bg-blue-500',
    textClass: 'text-blue-500',
  },
  other: {
    key: 'other',
    label: 'Other',
    color: '#94a3b8',
    bgColor: 'rgba(148, 163, 184, 0.18)',
    hoverBgColor: 'rgba(148, 163, 184, 0.45)',
    borderClass: 'border-theme-primary/40',
    accentClass: 'bg-theme-primary/10',
    indicatorClass: 'bg-theme-primary/70',
    dotClass: 'bg-theme-primary',
    textClass: 'text-theme-primary',
  },
};

const JOB_KEYWORDS: Record<JobColorKey, string[]> = {
  bartender: ['bartender'],
  busser: ['busser'],
  dishwasher: ['dishwasher'],
  host: ['host'],
  kitchen: ['kitchen', 'line cook', 'cook'],
  manager: ['manager'],
  server: ['server'],
  other: [],
};

export function normalizeJobName(name?: string) {
  return name?.trim().toLowerCase() ?? '';
}

export function getJobColorKey(name?: string): JobColorKey {
  const normalized = normalizeJobName(name);
  if (!normalized) return 'other';
  for (const key of Object.keys(JOB_COLOR_STYLES) as JobColorKey[]) {
    if (key === 'other') continue;
    const keywords = JOB_KEYWORDS[key] ?? [];
    if (keywords.some((keyword) => normalized.includes(keyword))) {
      return key;
    }
  }
  return 'other';
}

export function getJobColorClasses(name?: string): JobColorConfig {
  return JOB_COLOR_STYLES[getJobColorKey(name)];
}
