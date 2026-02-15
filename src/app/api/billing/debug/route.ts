import { NextRequest, NextResponse } from 'next/server';
import {
  STRIPE_ANNUAL_PRICE_ID,
  STRIPE_MONTHLY_PRICE_ID,
  STRIPE_WEBHOOK_SECRET,
} from '@/lib/stripe/config';
import { getBaseUrls } from '@/lib/routing/getBaseUrls';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function prefix(value: string, length = 6) {
  const normalized = String(value ?? '').trim();
  if (!normalized) return null;
  return normalized.slice(0, length);
}

type PublishablePrefix = 'pk_test' | 'pk_live' | 'missing';
type SecretPrefix = 'sk_test' | 'sk_live' | 'missing';
type StripeMode = 'test' | 'live' | 'unknown';

function getPublishableKeyPrefix(value: string): PublishablePrefix {
  const normalized = String(value ?? '').trim();
  if (!normalized) return 'missing';
  if (normalized.startsWith('pk_test_')) return 'pk_test';
  if (normalized.startsWith('pk_live_')) return 'pk_live';
  return 'missing';
}

function getSecretKeyPrefix(value: string): SecretPrefix {
  const normalized = String(value ?? '').trim();
  if (!normalized) return 'missing';
  if (normalized.startsWith('sk_test_')) return 'sk_test';
  if (normalized.startsWith('sk_live_')) return 'sk_live';
  return 'missing';
}

function deriveStripeMode(secretKeyPrefix: SecretPrefix, publishableKeyPrefix: PublishablePrefix): StripeMode {
  if (secretKeyPrefix === 'sk_test' && publishableKeyPrefix === 'pk_test') return 'test';
  if (secretKeyPrefix === 'sk_live' && publishableKeyPrefix === 'pk_live') return 'live';
  return 'unknown';
}

export async function GET(request: NextRequest) {
  const host =
    String(request.headers.get('x-forwarded-host') ?? '').trim()
    || String(request.headers.get('host') ?? '').trim()
    || 'unknown';
  const proto =
    String(request.headers.get('x-forwarded-proto') ?? '').trim()
    || request.nextUrl.protocol.replace(':', '')
    || 'https';
  const requestOrigin = host === 'unknown' ? request.nextUrl.origin : `${proto}://${host}`;
  const { appBaseUrl, loginBaseUrl } = getBaseUrls(requestOrigin);

  const stripeSecretKey = String(process.env.STRIPE_SECRET_KEY ?? '').trim();
  const stripePublishableKey = String(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '').trim();
  const monthlyPriceId = String(STRIPE_MONTHLY_PRICE_ID ?? '').trim();
  const annualPriceId = String(STRIPE_ANNUAL_PRICE_ID ?? '').trim();
  const publishableKeyPrefix = getPublishableKeyPrefix(stripePublishableKey);
  const secretKeyPrefix = getSecretKeyPrefix(stripeSecretKey);
  const mode = deriveStripeMode(secretKeyPrefix, publishableKeyPrefix);

  return NextResponse.json({
    host,
    origin: requestOrigin,
    pathname: request.nextUrl.pathname,
    appBaseUrl,
    loginBaseUrl,
    hasSecretKey: Boolean(stripeSecretKey),
    hasPublishableKey: Boolean(stripePublishableKey),
    publishableKeyPrefix,
    secretKeyPrefix,
    mode,
    hasWebhookSecret: Boolean(String(STRIPE_WEBHOOK_SECRET ?? '').trim()),
    hasPriceId: Boolean(monthlyPriceId || annualPriceId),
    hasMonthlyPriceId: Boolean(monthlyPriceId),
    hasAnnualPriceId: Boolean(annualPriceId),
    monthlyPriceIdPrefix: prefix(monthlyPriceId),
    annualPriceIdPrefix: prefix(annualPriceId),
  });
}
