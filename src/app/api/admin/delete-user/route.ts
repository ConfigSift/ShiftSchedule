import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getUserRole, isManagerRole } from '@/utils/role';

type DeletePayload = {
  userId: string;
  organizationId: string;
};

export async function POST(request: Request) {
  const payload = (await request.json()) as DeletePayload;
  const allowAdminCreation = process.env.ENABLE_ADMIN_CREATION === 'true';

  if (!payload.userId || !payload.organizationId) {
    return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 });
  }

  const supabaseServer = await createSupabaseServerClient();
  const { data: sessionData } = await supabaseServer.auth.getSession();
  const authUserId = sessionData.session?.user?.id;

  if (!authUserId) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const { data: requester, error: requesterError } = await supabaseServer
    .from('users')
    .select('id,organization_id,account_type,role,auth_user_id')
    .eq('auth_user_id', authUserId)
    .maybeSingle();

  if (requesterError || !requester) {
    return NextResponse.json({ error: 'Requester profile not found.' }, { status: 403 });
  }

  const requesterRole = getUserRole(requester.account_type ?? requester.role);
  if (!isManagerRole(requesterRole)) {
    return NextResponse.json({ error: 'Insufficient permissions.' }, { status: 403 });
  }

  if (requester.organization_id !== payload.organizationId) {
    return NextResponse.json({ error: 'Organization mismatch.' }, { status: 403 });
  }

  const { data: target, error: targetError } = await supabaseAdmin
    .from('users')
    .select('id,auth_user_id,organization_id,account_type,role')
    .eq('id', payload.userId)
    .maybeSingle();

  if (targetError || !target) {
    return NextResponse.json({ error: 'Target user not found.' }, { status: 404 });
  }

  if (target.organization_id !== payload.organizationId) {
    return NextResponse.json({ error: 'Target not in this organization.' }, { status: 403 });
  }

  if (target.auth_user_id === authUserId) {
    return NextResponse.json({ error: "You can't delete your own account." }, { status: 403 });
  }

  const targetRole = getUserRole(target.account_type ?? target.role);
  if (requesterRole === 'MANAGER' && targetRole === 'ADMIN') {
    return NextResponse.json({ error: 'Managers cannot delete admins.' }, { status: 403 });
  }
  if (targetRole === 'ADMIN' && !allowAdminCreation) {
    return NextResponse.json({ error: 'Admin deletion is disabled.' }, { status: 403 });
  }

  try {
    const { error: deleteError } = await supabaseAdmin
      .from('users')
      .delete()
      .eq('id', payload.userId);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 400 });
    }

    if (target.auth_user_id) {
      const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(target.auth_user_id);
      if (authDeleteError) {
        return NextResponse.json({ error: authDeleteError.message }, { status: 400 });
      }
    }
  } catch {
    return NextResponse.json(
      { error: 'Unable to delete user. Check for related shifts or constraints.' },
      { status: 400 }
    );
  }

  return NextResponse.json({ success: true });
}
