import { apiFetch } from '../apiClient';

const BILLING_ENABLED = process.env.NEXT_PUBLIC_BILLING_ENABLED === 'true';

/**
 * Fire-and-forget billing quantity sync after location CRUD.
 *
 * Call this after creating or deleting a location so the Stripe
 * subscription quantity stays in sync with the actual location count.
 *
 * - Skips silently when BILLING_ENABLED is false.
 * - Returns { ok, error? } so callers can optionally show a warning toast.
 * - Should NOT block UI — location mutations succeed even if sync fails.
 *
 * Usage (in location create/delete handlers):
 *   const syncResult = await syncBillingQuantity(organizationId);
 *   if (!syncResult.ok) {
 *     showToast('Location saved but billing sync failed.', 'error');
 *   }
 */
export async function syncBillingQuantity(
  organizationId: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!BILLING_ENABLED) {
    return { ok: true };
  }

  try {
    const result = await apiFetch<{ quantity: number; changed: boolean }>(
      '/api/billing/sync-quantity',
      {
        method: 'POST',
        json: { organizationId },
      },
    );

    if (!result.ok) {
      console.error('[syncBillingQuantity] API error:', result.error);
      return { ok: false, error: result.error };
    }

    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[syncBillingQuantity] unexpected error:', message);
    return { ok: false, error: message };
  }
}
