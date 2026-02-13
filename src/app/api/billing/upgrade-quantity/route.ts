import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { applySupabaseCookies, createSupabaseRouteClient } from '@/lib/supabase/route';
import { jsonError } from '@/lib/apiResponses';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { BILLING_ENABLED } from '@/lib/stripe/config';
import { stripe } from '@/lib/stripe/server';
import {
  getBillingAccountByAuthUserId,
  isActiveBillingStatus,
  upsertBillingAccountFromSubscription,
} from '@/lib/billing/customer';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type UpgradeQuantityPayload = {
  intentId?: string;
};

async function resolveInvoiceForResult(invoice: string | Stripe.Invoice | null | undefined) {
  if (!invoice) return null;
  if (typeof invoice !== 'string') return invoice;
  try {
    return await stripe.invoices.retrieve(invoice);
  } catch {
    return null;
  }
}

function isInvoiceSettled(invoice: Stripe.Invoice | null) {
  if (!invoice) return true;
  return invoice.status === 'paid' || invoice.paid === true || Number(invoice.amount_due ?? 0) <= 0;
}

export async function POST(request: NextRequest) {
  let payload: UpgradeQuantityPayload;
  try {
    payload = (await request.json()) as UpgradeQuantityPayload;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const intentId = String(payload.intentId ?? '').trim();
  if (!intentId) {
    return NextResponse.json({ error: 'intentId is required.' }, { status: 400 });
  }

  const { supabase, response } = createSupabaseRouteClient(request);
  const { data: authData, error: authError } = await supabase.auth.getUser();
  const authUserId = authData.user?.id;
  if (!authUserId) {
    const message =
      process.env.NODE_ENV === 'production'
        ? 'Not signed in. Please sign out/in again.'
        : authError?.message || 'Unauthorized.';
    return applySupabaseCookies(jsonError(message, 401), response);
  }

  const { data: intent, error: intentError } = await supabaseAdmin
    .from('organization_create_intents')
    .select('id,status,desired_quantity,auth_user_id')
    .eq('id', intentId)
    .eq('auth_user_id', authUserId)
    .maybeSingle();

  if (intentError) {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Unable to load intent.' }, { status: 500 }),
      response,
    );
  }

  if (!intent || intent.status !== 'pending') {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Intent is not pending.' }, { status: 409 }),
      response,
    );
  }

  if (!BILLING_ENABLED) {
    return applySupabaseCookies(
      NextResponse.json({ ok: true, bypass: true }),
      response,
    );
  }

  const desiredQuantity = Math.max(1, Number(intent.desired_quantity ?? 1));
  const billingAccountResult = await getBillingAccountByAuthUserId(authUserId, supabaseAdmin);
  if (billingAccountResult.error) {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Unable to load billing account.' }, { status: 500 }),
      response,
    );
  }

  const billingAccount = billingAccountResult.data;
  if (
    !billingAccount ||
    !isActiveBillingStatus(billingAccount.status) ||
    !billingAccount.stripe_subscription_id
  ) {
    return applySupabaseCookies(
      NextResponse.json({
        ok: false,
        code: 'NO_SUBSCRIPTION',
        redirect: `/subscribe?intent=${encodeURIComponent(intentId)}`,
      }),
      response,
    );
  }

  try {
    const existingSubscription = await stripe.subscriptions.retrieve(
      billingAccount.stripe_subscription_id,
    );
    const existingQuantity = existingSubscription.items.data[0]?.quantity ?? 0;
    if (
      isActiveBillingStatus(existingSubscription.status) &&
      existingQuantity >= desiredQuantity
    ) {
      await upsertBillingAccountFromSubscription(authUserId, existingSubscription, supabaseAdmin);
      return applySupabaseCookies(
        NextResponse.json({ ok: true, upgraded: true }),
        response,
      );
    }

    const subscriptionItemId =
      billingAccount.stripe_subscription_item_id ??
      existingSubscription.items.data[0]?.id ??
      null;

    if (!subscriptionItemId) {
      return applySupabaseCookies(
        NextResponse.json({ error: 'Subscription item not found.' }, { status: 500 }),
        response,
      );
    }

    const updatedSubscription = await stripe.subscriptions.update(
      billingAccount.stripe_subscription_id,
      {
        items: [{ id: subscriptionItemId, quantity: desiredQuantity }],
        proration_behavior: 'always_invoice',
        payment_behavior: 'pending_if_incomplete',
        expand: ['latest_invoice.payment_intent'],
      },
    );

    await upsertBillingAccountFromSubscription(authUserId, updatedSubscription, supabaseAdmin);

    const latestInvoice = await resolveInvoiceForResult(
      updatedSubscription.latest_invoice as string | Stripe.Invoice | null,
    );
    const invoiceSettled = isInvoiceSettled(latestInvoice);
    const status = String(updatedSubscription.status ?? '').trim().toLowerCase();
    const activeNow = isActiveBillingStatus(status);

    if (activeNow && invoiceSettled) {
      return applySupabaseCookies(
        NextResponse.json({ ok: true, upgraded: true }),
        response,
      );
    }

    return applySupabaseCookies(
      NextResponse.json({
        ok: false,
        code: 'PAYMENT_REQUIRED',
        hostedInvoiceUrl: latestInvoice?.hosted_invoice_url ?? null,
        manageBillingUrl: '/billing',
      }),
      response,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return applySupabaseCookies(
      NextResponse.json({ error: message || 'Unable to update subscription quantity.' }, { status: 500 }),
      response,
    );
  }
}
