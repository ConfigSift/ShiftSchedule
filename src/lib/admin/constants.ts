import type { ActivationStage, AlertSeverity } from './types';

// ---------------------------------------------------------------------------
// Activation
// ---------------------------------------------------------------------------

/** Minimum shifts in the last 7 days to qualify as "active" (stage 3+). */
export const ACTIVATION_THRESHOLD = 5;

export const ACTIVATION_STAGE_LABELS: Record<ActivationStage, string> = {
  0: 'Created — no employees',
  1: 'Has employees — no shifts',
  2: 'Has shifts — below activity threshold',
  3: 'Active',
  4: 'Active + subscribed',
};

export const ACTIVATION_STAGE_COLORS: Record<ActivationStage, string> = {
  0: 'bg-zinc-100 text-zinc-600',
  1: 'bg-amber-100 text-amber-700',
  2: 'bg-blue-100 text-blue-700',
  3: 'bg-emerald-100 text-emerald-700',
  4: 'bg-emerald-100 text-emerald-700',
};

// ---------------------------------------------------------------------------
// Subscription status filter options
// ---------------------------------------------------------------------------

export const SUBSCRIPTION_STATUSES = [
  'active',
  'trialing',
  'past_due',
  'canceled',
  'incomplete',
  'incomplete_expired',
  'unpaid',
  'paused',
] as const;

export type SubscriptionStatusOption = (typeof SUBSCRIPTION_STATUSES)[number];

export const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatusOption, string> = {
  active: 'Active',
  trialing: 'Trialing',
  past_due: 'Past Due',
  canceled: 'Canceled',
  incomplete: 'Incomplete',
  incomplete_expired: 'Incomplete Expired',
  unpaid: 'Unpaid',
  paused: 'Paused',
};

export const SUBSCRIPTION_STATUS_COLORS: Record<SubscriptionStatusOption, string> = {
  active: 'bg-emerald-100 text-emerald-700',
  trialing: 'bg-blue-100 text-blue-700',
  past_due: 'bg-amber-100 text-amber-700',
  canceled: 'bg-zinc-100 text-zinc-600',
  incomplete: 'bg-red-100 text-red-700',
  incomplete_expired: 'bg-red-100 text-red-700',
  unpaid: 'bg-red-100 text-red-700',
  paused: 'bg-zinc-100 text-zinc-600',
};

// ---------------------------------------------------------------------------
// Alert severity
// ---------------------------------------------------------------------------

export const ALERT_SEVERITY_COLORS: Record<AlertSeverity, string> = {
  info: 'bg-blue-100 text-blue-700',
  warning: 'bg-amber-100 text-amber-700',
  error: 'bg-red-100 text-red-700',
};
