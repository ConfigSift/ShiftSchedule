import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getUserRole, isManagerRole } from '@/utils/role';
import { normalizeJobs } from '@/utils/jobs';

type CreatePayload = {
  organizationId: string;
  fullName: string;
  phone?: string;
  email: string;
  accountType: string;
  jobs: string[];
  passcode: string;
};

function isValidPasscode(passcode: string) {
  return /^\d{6}$/.test(passcode);
}

function sanitizeJobs(jobs: string[]) {
  return normalizeJobs(jobs);
}

export async function POST(request: Request) {
  const payload = (await request.json()) as CreatePayload;
  const allowAdminCreation = process.env.ENABLE_ADMIN_CREATION === 'true';

  if (!payload.organizationId || !payload.fullName || !payload.email) {
    return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 });
  }

  if (!isValidPasscode(payload.passcode)) {
    return NextResponse.json({ error: 'Passcode must be exactly 6 digits.' }, { status: 400 });
  }

  const supabaseServer = await createSupabaseServerClient();
  const { data: sessionData } = await supabaseServer.auth.getSession();
  const authUserId = sessionData.session?.user?.id;

  if (!authUserId) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const { data: requester, error: requesterError } = await supabaseServer
    .from('users')
    .select('id,organization_id,account_type,role')
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

  const rawRole = String(payload.accountType ?? '').trim();
  const targetRole = getUserRole(rawRole);
  if (!rawRole || !['ADMIN', 'MANAGER', 'EMPLOYEE', 'STAFF'].includes(rawRole.toUpperCase())) {
    return NextResponse.json({ error: 'Invalid account type.' }, { status: 400 });
  }
  if (requesterRole === 'MANAGER' && targetRole === 'ADMIN') {
    return NextResponse.json({ error: 'Managers cannot create admins.' }, { status: 403 });
  }
  if (targetRole === 'ADMIN' && !allowAdminCreation) {
    return NextResponse.json({ error: 'Admin creation is disabled.' }, { status: 403 });
  }

  const normalizedJobs = sanitizeJobs(payload.jobs ?? []);
  if ((targetRole === 'EMPLOYEE' || targetRole === 'MANAGER') && normalizedJobs.length === 0) {
    return NextResponse.json({ error: 'Managers and employees must have at least one job.' }, { status: 400 });
  }

  const { data: createData, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email: payload.email,
    password: payload.passcode,
    email_confirm: true,
  });

  if (createError) {
    return NextResponse.json({ error: createError.message }, { status: 400 });
  }

  const newAuthUserId = createData.user?.id;
  if (!newAuthUserId) {
    return NextResponse.json({ error: 'Failed to create auth user.' }, { status: 500 });
  }

  const { error: insertError } = await supabaseAdmin.from('users').insert({
    auth_user_id: newAuthUserId,
    organization_id: payload.organizationId,
    full_name: payload.fullName,
    phone: payload.phone ?? '',
    email: payload.email,
    account_type: targetRole,
    jobs: normalizedJobs,
  });

  if (insertError) {
    await supabaseAdmin.auth.admin.deleteUser(newAuthUserId);
    return NextResponse.json({ error: insertError.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
