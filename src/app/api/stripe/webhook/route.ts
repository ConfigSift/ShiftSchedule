import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { stripe } from '@/lib/stripe/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Local Stripe CLI helper:
// stripe listen --forward-to http://localhost:3000/api/stripe/webhook
export async function POST(request: NextRequest) {
  const webhookSecret = String(process.env.STRIPE_WEBHOOK_SECRET ?? '').trim();
  if (!webhookSecret) {
    // Keep valid-event behavior predictable in local dev; do not expose secrets.
    return NextResponse.json({ error: 'Webhook not configured.' }, { status: 500 });
  }

  const body = await request.text();
  const signature = request.headers.get('stripe-signature') || '';

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[stripe:webhook] signature verification failed', { message });
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 400 });
  }

  const eventObject = event.data.object as unknown as Record<string, unknown>;
  const id =
    String(
      eventObject.id
      ?? eventObject.subscription
      ?? eventObject.payment_intent
      ?? eventObject.customer
      ?? '',
    ).trim() || null;

  switch (event.type) {
    case 'checkout.session.completed':
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
    case 'invoice.paid':
    case 'invoice.payment_failed':
    case 'invoice.payment_action_required':
    case 'payment_intent.requires_action':
      console.log('[stripe:webhook] handled', { eventType: event.type, eventId: event.id, id });
      break;
    default:
      console.log('[stripe:webhook] unhandled_ack', { eventType: event.type, eventId: event.id, id });
      break;
  }

  return NextResponse.json({ received: true }, { status: 200 });
}
