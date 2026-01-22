import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getUserRole, isManagerRole } from '@/utils/role';
import { normalizeJobs, serializeJobsForStorage } from '@/utils/jobs';

type UpdatePayload = {
  userId: string;
  organizationId: string;
  fullName: string;
  phone?: string;
  accountType?: string;
  jobs?: string[];
  passcode?: string;
};

export async function POST(request: Request) {
  const payload = (await request.json()) as UpdatePayload;
  const allowAdminCreation = process.env.ENABLE_ADMIN_CREATION === 'true';

  if (!payload.userId || !payload.organizationId || !payload.fullName) {
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
    .select('id,auth_user_id,organization_id,account_type,role,jobs')
    .eq('id', payload.userId)
    .maybeSingle();

  if (targetError || !target) {
    return NextResponse.json({ error: 'Target user not found.' }, { status: 404 });
  }

  if (target.organization_id !== payload.organizationId) {
    return NextResponse.json({ error: 'Target not in this organization.' }, { status: 403 });
  }

  const rawRole = payload.accountType ?? target.account_type ?? target.role ?? '';
  const targetCurrentRole = getUserRole(target.account_type ?? target.role);
  const targetRole = getUserRole(rawRole);
  if (payload.accountType && !['ADMIN', 'MANAGER', 'EMPLOYEE', 'STAFF'].includes(String(payload.accountType).toUpperCase())) {
    return NextResponse.json({ error: 'Invalid account type.' }, { status: 400 });
  }

  if (requesterRole === 'MANAGER' && targetCurrentRole === 'ADMIN') {
    return NextResponse.json({ error: 'Managers cannot edit admins.' }, { status: 403 });
  }

  if (requesterRole === 'MANAGER' && targetRole === 'ADMIN') {
    return NextResponse.json({ error: 'Managers cannot assign ADMIN.' }, { status: 403 });
  }

  if (requesterRole === 'MANAGER' && targetRole !== 'MANAGER' && targetRole !== 'EMPLOYEE') {
    return NextResponse.json({ error: 'Managers can only assign MANAGER or EMPLOYEE.' }, { status: 403 });
  }

  if (targetRole === 'ADMIN' && !allowAdminCreation) {
    return NextResponse.json({ error: 'Admin updates are disabled.' }, { status: 403 });
  }

  if (requesterRole === 'ADMIN' && target.auth_user_id === authUserId && targetRole !== 'ADMIN') {
    return NextResponse.json({ error: 'Admins cannot demote themselves.' }, { status: 403 });
  }
  if (target.auth_user_id === authUserId && payload.accountType && targetRole !== targetCurrentRole) {
    return NextResponse.json({ error: 'You cannot change your own account type.' }, { status: 403 });
  }

  const normalizedJobs = payload.jobs ? normalizeJobs(payload.jobs) : normalizeJobs(target.jobs);
  if ((targetRole === 'EMPLOYEE' || targetRole === 'MANAGER') && normalizedJobs.length === 0) {
    return NextResponse.json({ error: 'Managers and employees must have at least one job.' }, { status: 400 });
  }
  const jobsPayload = serializeJobsForStorage(target.jobs, normalizedJobs);

  const { error: updateError } = await supabaseAdmin
    .from('users')
    .update({
      full_name: payload.fullName,
      phone: payload.phone ?? '',
      account_type: targetRole,
      jobs: jobsPayload,
    })
    .eq('id', payload.userId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  if (payload.passcode) {
    if (!/^\d{6}$/.test(payload.passcode)) {
      return NextResponse.json({ error: 'Passcode must be exactly 6 digits.' }, { status: 400 });
    }
    if (!target.auth_user_id) {
      return NextResponse.json({ error: 'Target auth user missing.' }, { status: 400 });
    }
    const { error: authUpdateError } = await supabaseAdmin.auth.admin.updateUserById(
      target.auth_user_id,
      { password: payload.passcode }
    );
    if (authUpdateError) {
      return NextResponse.json({ error: authUpdateError.message }, { status: 400 });
    }
  }

  return NextResponse.json({ success: true });
}
