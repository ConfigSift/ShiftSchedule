/**
 * Stripe product & pricing configuration.
 *
 * All IDs come from env vars so they can differ between
 * Stripe test-mode and live-mode without code changes.
 */

/** Monthly price: $19.99/location/month */
export const STRIPE_MONTHLY_PRICE_ID = process.env.STRIPE_PRICE_PRO_MONTHLY ?? '';

/** Annual price: $199/location/year */
export const STRIPE_ANNUAL_PRICE_ID = process.env.STRIPE_PRICE_PRO_YEARLY ?? '';

/**
 * Intro promotion code string for the monthly plan checkout.
 * Example: CREWSHYFTPRO1
 */
export const STRIPE_INTRO_PROMO_CODE_MONTHLY = process.env.STRIPE_COUPON_INTRO_MONTHLY
  ?? process.env.STRIPE_COUPON_INTRO
  ?? '';

/**
 * Intro promotion code string for the annual plan checkout.
 * Example: CREWSHYFTPROANNUAL1
 */
export const STRIPE_INTRO_PROMO_CODE_YEARLY = process.env.STRIPE_COUPON_INTRO_YEARLY ?? '';

/** Webhook signing secret for verifying Stripe events */
export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? '';

/** Whether the billing system is enabled */
export const BILLING_ENABLED = process.env.NEXT_PUBLIC_BILLING_ENABLED === 'true';

export type StripePriceType = 'monthly' | 'annual';
export type StripeCurrency =
  | 'USD'
  | 'CAD'
  | 'EUR'
  | 'GBP'
  | 'AUD'
  | 'JPY'
  | 'BRL'
  | 'MXN'
  | 'SGD';

export const SUPPORTED_STRIPE_CURRENCIES: StripeCurrency[] = [
  'USD',
  'CAD',
  'EUR',
  'GBP',
  'AUD',
  'JPY',
  'BRL',
  'MXN',
  'SGD',
];

const MONTHLY_PRICE_BY_CURRENCY: Record<StripeCurrency, string> = {
  USD: process.env.PRICE_MONTHLY_USD ?? STRIPE_MONTHLY_PRICE_ID,
  CAD: process.env.PRICE_MONTHLY_CAD ?? '',
  EUR: process.env.PRICE_MONTHLY_EUR ?? '',
  GBP: process.env.PRICE_MONTHLY_GBP ?? '',
  AUD: process.env.PRICE_MONTHLY_AUD ?? '',
  JPY: process.env.PRICE_MONTHLY_JPY ?? '',
  BRL: process.env.PRICE_MONTHLY_BRL ?? '',
  MXN: process.env.PRICE_MONTHLY_MXN ?? '',
  SGD: process.env.PRICE_MONTHLY_SGD ?? '',
};

const ANNUAL_PRICE_BY_CURRENCY: Record<StripeCurrency, string> = {
  USD: process.env.PRICE_ANNUAL_USD ?? STRIPE_ANNUAL_PRICE_ID,
  CAD: process.env.PRICE_ANNUAL_CAD ?? '',
  EUR: process.env.PRICE_ANNUAL_EUR ?? '',
  GBP: process.env.PRICE_ANNUAL_GBP ?? '',
  AUD: process.env.PRICE_ANNUAL_AUD ?? '',
  JPY: process.env.PRICE_ANNUAL_JPY ?? '',
  BRL: process.env.PRICE_ANNUAL_BRL ?? '',
  MXN: process.env.PRICE_ANNUAL_MXN ?? '',
  SGD: process.env.PRICE_ANNUAL_SGD ?? '',
};

export function normalizeStripeCurrency(value: string | null | undefined): StripeCurrency | null {
  const normalized = String(value ?? '').trim().toUpperCase();
  if (!normalized) return null;
  return SUPPORTED_STRIPE_CURRENCIES.includes(normalized as StripeCurrency)
    ? (normalized as StripeCurrency)
    : null;
}

export function getStripePriceId(
  priceType: StripePriceType,
  currency: StripeCurrency,
): string {
  const mapping = priceType === 'annual' ? ANNUAL_PRICE_BY_CURRENCY : MONTHLY_PRICE_BY_CURRENCY;
  return String(mapping[currency] ?? '').trim();
}
