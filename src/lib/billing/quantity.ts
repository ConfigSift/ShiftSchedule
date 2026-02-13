import { syncStripeQuantityToOwnedOrgCount } from '@/lib/billing/lifecycle';

type SyncStripeQuantityInput = {
  authUserId: string;
};

export type SyncStripeQuantityResult = {
  ok: boolean;
  quantitySynced: boolean;
  changed: boolean;
  billingEnabled: boolean;
  ownedRestaurantCount: number;
  desiredQuantity: number;
  newQuantity: number;
  currentQuantity: number | null;
  stripeSubscriptionId: string | null;
  stripeCustomerId: string | null;
  subscriptionStatus: string;
  canceled: boolean;
  syncError?: string;
};

export async function syncStripeQuantityForCustomer(
  input: SyncStripeQuantityInput,
): Promise<SyncStripeQuantityResult> {
  const result = await syncStripeQuantityToOwnedOrgCount(input.authUserId);
  return {
    ok: result.ok,
    quantitySynced: result.quantitySynced,
    changed: result.changed,
    billingEnabled: true,
    ownedRestaurantCount: result.ownedRestaurantCount,
    desiredQuantity: result.ownedRestaurantCount,
    newQuantity: result.newQuantity,
    currentQuantity: null,
    stripeSubscriptionId: result.stripeSubscriptionId,
    stripeCustomerId: result.stripeCustomerId,
    subscriptionStatus: result.subscriptionStatus,
    canceled: result.canceled,
    syncError: result.syncError,
  };
}
