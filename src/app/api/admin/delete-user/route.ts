import { NextResponse } from 'next/server';
import { createSupabaseRouteHandlerClient } from '@/lib/supabase/route';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getUserRole, isManagerRole } from '@/utils/role';
import { normalizeUserRow } from '@/utils/userMapper';

export const dynamic = 'force-dynamic';

type DeletePayload = {
  userId: string;
  organizationId: string;
};

export async function POST(request: Request) {
  const payload = (await request.json()) as DeletePayload;

  if (!payload.userId || !payload.organizationId) {
    return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 });
  }

  const supabaseServer = await createSupabaseRouteHandlerClient();
  const { data: sessionData, error: sessionError } = await supabaseServer.auth.getSession();
  const authUserId = sessionData.session?.user?.id;

  if (!authUserId) {
    const message =
      process.env.NODE_ENV === 'production'
        ? 'Not signed in. Please sign out/in again.'
        : sessionError?.message || 'Unauthorized.';
    return NextResponse.json({ error: message }, { status: 401 });
  }

  const { data: requesterRow, error: requesterError } = await supabaseServer
    .from('users')
    .select('*')
    .eq('auth_user_id', authUserId)
    .maybeSingle();

  if (requesterError || !requesterRow) {
    return NextResponse.json({ error: 'Requester profile not found.' }, { status: 403 });
  }

  const requester = normalizeUserRow(requesterRow);
  const requesterRole = requester.role;
  if (!isManagerRole(requesterRole)) {
    return NextResponse.json({ error: 'Insufficient permissions.' }, { status: 403 });
  }

  if (requester.organizationId !== payload.organizationId) {
    return NextResponse.json({ error: 'Organization mismatch.' }, { status: 403 });
  }

  const { data: targetRow, error: targetError } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('id', payload.userId)
    .maybeSingle();

  if (targetError || !targetRow) {
    return NextResponse.json({ error: 'Target user not found.' }, { status: 404 });
  }

  const target = normalizeUserRow(targetRow);

  if (target.organizationId !== payload.organizationId) {
    return NextResponse.json({ error: 'Target not in this organization.' }, { status: 403 });
  }

  if (target.authUserId === authUserId) {
    return NextResponse.json({ error: "You can't delete your own account." }, { status: 403 });
  }

  const targetRole = target.role;
  if (requesterRole === 'MANAGER' && targetRole === 'ADMIN') {
    return NextResponse.json({ error: 'Managers cannot delete admins.' }, { status: 403 });
  }

  try {
    const { error: deleteError } = await supabaseAdmin
      .from('users')
      .delete()
      .eq('id', payload.userId);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 400 });
    }

    if (target.authUserId) {
      const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(target.authUserId);
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
