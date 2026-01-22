import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getUserRole, isManagerRole } from '@/utils/role';
import { normalizeJobs, serializeJobsForStorage } from '@/utils/jobs';
import { normalizeUserRow, splitFullName } from '@/utils/userMapper';

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

  const rawRole = payload.accountType ?? target.role ?? '';
  const targetCurrentRole = target.role;
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

  if (payload.accountType && targetRole === 'ADMIN' && !allowAdminCreation) {
    return NextResponse.json({ error: 'Admin updates are disabled.' }, { status: 403 });
  }

  if (requesterRole === 'ADMIN' && target.authUserId === authUserId && targetRole !== 'ADMIN') {
    return NextResponse.json({ error: 'Admins cannot demote themselves.' }, { status: 403 });
  }
  if (target.authUserId === authUserId && payload.accountType && targetRole !== targetCurrentRole) {
    return NextResponse.json({ error: 'You cannot change your own account type.' }, { status: 403 });
  }

  const normalizedJobs = payload.jobs ? normalizeJobs(payload.jobs) : normalizeJobs(targetRow.jobs);
  if ((targetRole === 'EMPLOYEE' || targetRole === 'MANAGER') && normalizedJobs.length === 0) {
    return NextResponse.json({ error: 'Managers and employees must have at least one job.' }, { status: 400 });
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
        return NextResponse.json({ error: legacyResult.error.message }, { status: 400 });
      }
    } else {
      return NextResponse.json({ error: updateResult.error.message }, { status: 400 });
    }
  }

  if (payload.passcode) {
    if (!/^\d{6}$/.test(payload.passcode)) {
      return NextResponse.json({ error: 'Passcode must be exactly 6 digits.' }, { status: 400 });
    }
    if (!target.authUserId) {
      return NextResponse.json({ error: 'Target auth user missing.' }, { status: 400 });
    }
    const { error: authUpdateError } = await supabaseAdmin.auth.admin.updateUserById(
      target.authUserId,
      { password: payload.passcode }
    );
    if (authUpdateError) {
      return NextResponse.json({ error: authUpdateError.message }, { status: 400 });
    }
  }

  return NextResponse.json({ success: true });
}
