import { NextRequest, NextResponse } from 'next/server';
import { applySupabaseCookies, createSupabaseRouteClient } from '@/lib/supabase/route';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getUserRole, isManagerRole } from '@/utils/role';
import { normalizeJobs, serializeJobsForStorage } from '@/utils/jobs';
import { normalizeUserRow, splitFullName } from '@/utils/userMapper';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type UpdatePayload = {
  userId: string;
  organizationId: string;
  fullName: string;
  phone?: string;
  accountType?: string;
  jobs?: string[];
  passcode?: string;
};

export async function POST(request: NextRequest) {
  const payload = (await request.json()) as UpdatePayload;
  const allowAdminCreation = process.env.ENABLE_ADMIN_CREATION === 'true';

  if (!payload.userId || !payload.organizationId || !payload.fullName) {
    return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 });
  }

  const { supabase, response } = createSupabaseRouteClient(request);
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  const authUserId = sessionData.session?.user?.id;

  if (!authUserId) {
    const message =
      process.env.NODE_ENV === 'production'
        ? 'Not signed in. Please sign out/in again.'
        : sessionError?.message || 'Unauthorized.';
    return applySupabaseCookies(NextResponse.json({ error: message }, { status: 401 }), response);
  }

  const { data: requesterRow, error: requesterError } = await supabase
    .from('users')
    .select('*')
    .eq('auth_user_id', authUserId)
    .maybeSingle();

  if (requesterError || !requesterRow) {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Requester profile not found.' }, { status: 403 }),
      response
    );
  }

  const requester = normalizeUserRow(requesterRow);
  const requesterRole = requester.role;
  if (!isManagerRole(requesterRole)) {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Insufficient permissions.' }, { status: 403 }),
      response
    );
  }

  if (requester.organizationId !== payload.organizationId) {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Organization mismatch.' }, { status: 403 }),
      response
    );
  }

  const { data: targetRow, error: targetError } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('id', payload.userId)
    .maybeSingle();

  if (targetError || !targetRow) {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Target user not found.' }, { status: 404 }),
      response
    );
  }

  const target = normalizeUserRow(targetRow);

  if (target.organizationId !== payload.organizationId) {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Target not in this organization.' }, { status: 403 }),
      response
    );
  }

  const rawRole = payload.accountType ?? target.role ?? '';
  const targetCurrentRole = target.role;
  const targetRole = getUserRole(rawRole);
  if (payload.accountType && !['ADMIN', 'MANAGER', 'EMPLOYEE', 'STAFF'].includes(String(payload.accountType).toUpperCase())) {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Invalid account type.' }, { status: 400 }),
      response
    );
  }

  if (requesterRole === 'MANAGER' && targetCurrentRole === 'ADMIN') {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Managers cannot edit admins.' }, { status: 403 }),
      response
    );
  }

  if (requesterRole === 'MANAGER' && targetRole === 'ADMIN') {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Managers cannot assign ADMIN.' }, { status: 403 }),
      response
    );
  }

  if (requesterRole === 'MANAGER' && targetRole !== 'MANAGER' && targetRole !== 'EMPLOYEE') {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Managers can only assign MANAGER or EMPLOYEE.' }, { status: 403 }),
      response
    );
  }

  if (payload.accountType && targetRole === 'ADMIN' && !allowAdminCreation) {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Admin updates are disabled.' }, { status: 403 }),
      response
    );
  }

  if (requesterRole === 'ADMIN' && target.authUserId === authUserId && targetRole !== 'ADMIN') {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Admins cannot demote themselves.' }, { status: 403 }),
      response
    );
  }
  if (target.authUserId === authUserId && payload.accountType && targetRole !== targetCurrentRole) {
    return applySupabaseCookies(
      NextResponse.json({ error: 'You cannot change your own account type.' }, { status: 403 }),
      response
    );
  }

  const normalizedJobs = payload.jobs ? normalizeJobs(payload.jobs) : normalizeJobs(targetRow.jobs);
  if ((targetRole === 'EMPLOYEE' || targetRole === 'MANAGER') && normalizedJobs.length === 0) {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Managers and employees must have at least one job.' }, { status: 400 }),
      response
    );
  }
  const jobsPayload = serializeJobsForStorage(targetRow.jobs, normalizedJobs);

  const baseUpdatePayload = {
    full_name: payload.fullName,
    phone: payload.phone ?? '',
    account_type: targetRole,
    jobs: jobsPayload,
  };

  const updateResult = await supabaseAdmin
    .from('users')
    .update(baseUpdatePayload)
    .eq('id', payload.userId);

  if (updateResult.error) {
    const message = updateResult.error.message?.toLowerCase() ?? '';
    if (message.includes('full_name') || message.includes('account_type')) {
      const { firstName, lastName } = splitFullName(payload.fullName);
      const legacyResult = await supabaseAdmin
        .from('users')
        .update({
          first_name: firstName,
          last_name: lastName,
          phone: payload.phone ?? '',
          role: targetRole,
          jobs: jobsPayload,
        })
        .eq('id', payload.userId);
      if (legacyResult.error) {
        return applySupabaseCookies(
          NextResponse.json({ error: legacyResult.error.message }, { status: 400 }),
          response
        );
      }
    } else {
      return applySupabaseCookies(
        NextResponse.json({ error: updateResult.error.message }, { status: 400 }),
        response
      );
    }
  }

  if (payload.passcode) {
    if (!/^\d{6}$/.test(payload.passcode)) {
      return applySupabaseCookies(
        NextResponse.json({ error: 'PIN must be exactly 6 digits.' }, { status: 400 }),
        response
      );
    }
    if (!target.authUserId) {
      return applySupabaseCookies(
        NextResponse.json({ error: 'Target auth user missing.' }, { status: 400 }),
        response
      );
    }
    const { error: authUpdateError } = await supabaseAdmin.auth.admin.updateUserById(
      target.authUserId,
      { password: payload.passcode }
    );
    if (authUpdateError) {
      return applySupabaseCookies(
        NextResponse.json({ error: authUpdateError.message }, { status: 400 }),
        response
      );
    }
  }

  return applySupabaseCookies(NextResponse.json({ success: true }), response);
}
