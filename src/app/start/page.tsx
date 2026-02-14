import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { BILLING_ENABLED } from '@/lib/stripe/config';
import { isActiveBillingStatus } from '@/lib/billing/customer';
import { normalizePersona } from '@/lib/persona';

export const dynamic = 'force-dynamic';

export default async function StartPage() {
  const supabase = await createSupabaseServerClient();

  let userId: string | null = null;
  let authPersona: string | null = null;
  try {
    const { data } = await supabase.auth.getUser();
    userId = data.user?.id ?? null;
    authPersona = String(data.user?.user_metadata?.persona ?? '').trim().toLowerCase() || null;
  } catch {
    // ignore auth errors
  }

  if (!userId) {
    redirect('/signup?next=/join');
  }

  const { data: profileRows } = await supabaseAdmin
    .from('users')
    .select('persona')
    .eq('auth_user_id', userId)
    .limit(1);

  const profile = profileRows?.[0] ?? null;
  const persona = normalizePersona(profile?.persona) ?? normalizePersona(authPersona);

  if (!persona) {
    redirect('/persona');
  }

  const { data: memberships } = await supabaseAdmin
    .from('organization_memberships')
    .select('organization_id, role')
    .eq('auth_user_id', userId);

  const membershipList = memberships ?? [];
  if (membershipList.length === 0) {
    redirect(persona === 'manager' ? '/restaurants' : '/join');
  }

  if (BILLING_ENABLED) {
    const ownedOrgCount = membershipList.filter((membership) => {
      const role = String(membership.role ?? '').trim().toLowerCase();
      return role === 'admin' || role === 'owner';
    }).length;

    if (ownedOrgCount > 0) {
      const { data: billingAccount } = await supabaseAdmin
        .from('billing_accounts')
        .select('status,quantity')
        .eq('auth_user_id', userId)
        .maybeSingle();

      const status = String(billingAccount?.status ?? '').trim().toLowerCase();
      const quantity = Math.max(0, Number(billingAccount?.quantity ?? 0));

      if (!isActiveBillingStatus(status)) {
        redirect('/subscribe');
      }

      if (quantity < ownedOrgCount) {
        redirect('/billing?upgrade=1');
      }
    }
  }

  redirect('/dashboard');
}
