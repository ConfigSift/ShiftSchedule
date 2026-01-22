import { NextResponse } from 'next/server';
import { createSupabaseRouteHandlerClient } from '@/lib/supabase/route';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getUserRole, isManagerRole } from '@/utils/role';
import { normalizeJobs } from '@/utils/jobs';
import { normalizeUserRow, splitFullName } from '@/utils/userMapper';

export const dynamic = 'force-dynamic';

type CreatePayload = {
  organizationId: string;
  fullName: string;
  phone?: string;
  email: string;
  accountType: string;
  jobs: string[];
  passcode?: string;
  pinCode?: string;
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

  const pinValue = payload.pinCode ?? payload.passcode ?? '';
  if (!isValidPasscode(pinValue)) {
    return NextResponse.json({ error: 'PIN must be exactly 6 digits.' }, { status: 400 });
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
    password: pinValue,
    email_confirm: true,
  });

  if (createError) {
    return NextResponse.json({ error: createError.message }, { status: 400 });
  }

  const newAuthUserId = createData.user?.id;
  if (!newAuthUserId) {
    return NextResponse.json({ error: 'Failed to create auth user.' }, { status: 500 });
  }

  const insertPayload = {
    auth_user_id: newAuthUserId,
    organization_id: payload.organizationId,
    full_name: payload.fullName,
    phone: payload.phone ?? '',
    email: payload.email,
    account_type: targetRole,
    jobs: normalizedJobs,
    pin_code: pinValue,
  };

  const insertResult = await supabaseAdmin.from('users').insert(insertPayload);

  if (insertResult.error) {
    const message = insertResult.error.message?.toLowerCase() ?? '';
    if (message.includes('pin_code')) {
      const { pin_code, ...withoutPin } = insertPayload;
      const pinFallbackResult = await supabaseAdmin.from('users').insert(withoutPin);
      if (pinFallbackResult.error) {
        await supabaseAdmin.auth.admin.deleteUser(newAuthUserId);
        return NextResponse.json({ error: pinFallbackResult.error.message }, { status: 400 });
      }
      return NextResponse.json({ success: true });
    }
    if (message.includes('full_name') || message.includes('account_type')) {
      const { firstName, lastName } = splitFullName(payload.fullName);
      const legacyPayload = {
        auth_user_id: newAuthUserId,
        organization_id: payload.organizationId,
        first_name: firstName,
        last_name: lastName,
        phone: payload.phone ?? '',
        email: payload.email,
        role: targetRole,
        jobs: normalizedJobs,
        pin_code: pinValue,
      };
      const legacyResult = await supabaseAdmin.from('users').insert(legacyPayload);
      if (legacyResult.error) {
        if (legacyResult.error.message?.toLowerCase().includes('pin_code')) {
          const { pin_code, ...legacyNoPin } = legacyPayload;
          const secondLegacy = await supabaseAdmin.from('users').insert(legacyNoPin);
          if (secondLegacy.error) {
            await supabaseAdmin.auth.admin.deleteUser(newAuthUserId);
            return NextResponse.json({ error: secondLegacy.error.message }, { status: 400 });
          }
          return NextResponse.json({ success: true });
        }
        await supabaseAdmin.auth.admin.deleteUser(newAuthUserId);
        return NextResponse.json({ error: legacyResult.error.message }, { status: 400 });
      }
    } else {
      await supabaseAdmin.auth.admin.deleteUser(newAuthUserId);
      return NextResponse.json({ error: insertResult.error.message }, { status: 400 });
    }
  }

  return NextResponse.json({ success: true });
}
