import { NextRequest, NextResponse } from 'next/server';
import { applySupabaseCookies } from '@/lib/supabase/route';
import { requireAdmin } from '@/lib/admin/auth';
import { getAdminSupabase } from '@/lib/admin/supabase';
import { getAuthUserById } from '@/lib/admin/authUsers';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ authUserId: string }> },
) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.error;
  const { response } = guard;
  const requestId = crypto.randomUUID();

  const { authUserId } = await params;
  if (!UUID_RE.test(authUserId)) {
    return applySupabaseCookies(
      NextResponse.json(
        { error: 'Invalid auth user ID.', requestId },
        { status: 400 },
      ),
      response,
    );
  }

  try {
    const db = getAdminSupabase();
    const authUser = await getAuthUserById(authUserId);
    if (authUser.exists) {
      return applySupabaseCookies(
        NextResponse.json(
          { error: 'Not orphaned; cannot delete via this endpoint.', requestId },
          { status: 400 },
        ),
        response,
      );
    }

    const { count: membershipCount, error: membershipError } = await db
      .from('organization_memberships')
      .select('organization_id', { count: 'exact', head: true })
      .eq('auth_user_id', authUserId);

    if (membershipError) {
      throw new Error(membershipError.message || 'Unable to verify memberships.');
    }

    if ((membershipCount ?? 0) > 0) {
      return applySupabaseCookies(
        NextResponse.json(
          {
            error: 'Cannot delete orphan profile while memberships still exist.',
            requestId,
            memberships: membershipCount,
          },
          { status: 409 },
        ),
        response,
      );
    }

    const [profileDelete, billingDelete] = await Promise.all([
      db
        .from('account_profiles')
        .delete({ count: 'exact' })
        .eq('auth_user_id', authUserId),
      db
        .from('billing_accounts')
        .delete({ count: 'exact' })
        .eq('auth_user_id', authUserId),
    ]);

    if (profileDelete.error) {
      throw new Error(profileDelete.error.message || 'Unable to delete orphan account profile.');
    }
    if (billingDelete.error) {
      throw new Error(billingDelete.error.message || 'Unable to delete orphan billing account.');
    }

    return applySupabaseCookies(
      NextResponse.json({
        ok: true,
        requestId,
        deleted: {
          account_profiles: profileDelete.count ?? 0,
          billing_accounts: billingDelete.count ?? 0,
        },
      }),
      response,
    );
  } catch (err) {
    console.error(`[admin/accounts/orphaned/${authUserId}]`, requestId, err);
    return applySupabaseCookies(
      NextResponse.json(
        { error: 'Failed to delete orphaned account profile.', requestId },
        { status: 500 },
      ),
      response,
    );
  }
}
