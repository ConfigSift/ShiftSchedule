import Stripe from 'stripe';

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

if (!stripeSecretKey) {
  throw new Error(
    'Missing STRIPE_SECRET_KEY environment variable. ' +
    'Add it to .env.local for local development.'
  );
}

export const stripe = new Stripe(stripeSecretKey, {
  typescript: true,
});
