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
 * Coupon for the $1 intro month.
 * Created in Stripe Dashboard: amount_off=1899, duration='once', currency='usd'.
 * Applied only to the first invoice of the monthly plan.
 */
export const STRIPE_INTRO_COUPON_ID = process.env.STRIPE_COUPON_INTRO ?? '';

/** Webhook signing secret for verifying Stripe events */
export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? '';

/** Whether the billing system is enabled */
export const BILLING_ENABLED = process.env.NEXT_PUBLIC_BILLING_ENABLED === 'true';
