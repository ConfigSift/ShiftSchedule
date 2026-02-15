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
  const monthlyPriceId = String(STRIPE_MONTHLY_PRICE_ID ?? '').trim();
  const annualPriceId = String(STRIPE_ANNUAL_PRICE_ID ?? '').trim();

  return NextResponse.json({
    host,
    appBaseUrl,
    loginBaseUrl,
    hasSecretKey: Boolean(stripeSecretKey),
    hasWebhookSecret: Boolean(String(STRIPE_WEBHOOK_SECRET ?? '').trim()),
    hasPriceId: Boolean(monthlyPriceId || annualPriceId),
    hasMonthlyPriceId: Boolean(monthlyPriceId),
    hasAnnualPriceId: Boolean(annualPriceId),
    monthlyPriceIdPrefix: prefix(monthlyPriceId),
    annualPriceIdPrefix: prefix(annualPriceId),
  });
}
