import { NextRequest, NextResponse } from 'next/server';
import { applySupabaseCookies, createSupabaseRouteClient } from '@/lib/supabase/route';
import { jsonError } from '@/lib/apiResponses';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getUserRole, isManagerRole } from '@/utils/role';
import { normalizeJobs } from '@/utils/jobs';
import { normalizeUserRow, splitFullName } from '@/utils/userMapper';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type CreatePayload = {
  organizationId: string;
  fullName: string;
  phone?: string;
  email: string;
  accountType: string;
  jobs: string[];
  passcode?: string;
  pinCode?: string;
  hourlyPay?: number;
};

function isValidPasscode(passcode: string) {
  return /^\d{6}$/.test(passcode);
}

function sanitizeJobs(jobs: string[]) {
  return normalizeJobs(jobs);
}

export async function POST(request: NextRequest) {
  const payload = (await request.json()) as CreatePayload;
  const allowAdminCreation = process.env.ENABLE_ADMIN_CREATION === 'true';

  if (!payload.organizationId || !payload.fullName || !payload.email) {
    return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 });
  }

  const pinValue = payload.pinCode ?? payload.passcode ?? '';
  if (!isValidPasscode(pinValue)) {
    return NextResponse.json({ error: 'PIN must be exactly 6 digits.' }, { status: 400 });
  }

  const { supabase, response } = createSupabaseRouteClient(request);
  const { data: authData, error: authError } = await supabase.auth.getUser();
  const authUserId = authData.user?.id;

  if (!authUserId) {
    const message =
      process.env.NODE_ENV === 'production'
        ? 'Not signed in. Please sign out/in again.'
        : authError?.message || 'Unauthorized.';
    return applySupabaseCookies(jsonError(message, 401), response);
  }

  const { data: requesterRow, error: requesterError } = await supabase
    .from('users')
    .select('*')
    .eq('auth_user_id', authUserId)
    .maybeSingle();

  if (requesterError || !requesterRow) {
    return applySupabaseCookies(jsonError('Requester profile not found.', 403), response);
  }

  const requester = normalizeUserRow(requesterRow);
  const requesterRole = requester.role;
  if (!isManagerRole(requesterRole)) {
    return applySupabaseCookies(jsonError('Insufficient permissions.', 403), response);
  }

  if (requester.organizationId !== payload.organizationId) {
    return applySupabaseCookies(jsonError('Organization mismatch.', 403), response);
  }

  const rawRole = String(payload.accountType ?? '').trim();
  const targetRole = getUserRole(rawRole);
  if (!rawRole || !['ADMIN', 'MANAGER', 'EMPLOYEE', 'STAFF'].includes(rawRole.toUpperCase())) {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Invalid account type.' }, { status: 400 }),
      response
    );
  }
  if (requesterRole === 'MANAGER' && targetRole === 'ADMIN') {
    return applySupabaseCookies(jsonError('Managers cannot create admins.', 403), response);
  }
  if (targetRole === 'ADMIN' && !allowAdminCreation) {
    return applySupabaseCookies(jsonError('Admin creation is disabled.', 403), response);
  }

  const normalizedJobs = sanitizeJobs(payload.jobs ?? []);
  if ((targetRole === 'EMPLOYEE' || targetRole === 'MANAGER') && normalizedJobs.length === 0) {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Managers and employees must have at least one job.' }, { status: 400 }),
      response
    );
  }

  const { data: createData, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email: payload.email,
    password: pinValue,
    email_confirm: true,
  });

  if (createError) {
    return applySupabaseCookies(NextResponse.json({ error: createError.message }, { status: 400 }), response);
  }

  const newAuthUserId = createData.user?.id;
  if (!newAuthUserId) {
    return applySupabaseCookies(NextResponse.json({ error: 'Failed to create auth user.' }, { status: 500 }), response);
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
    hourly_pay: payload.hourlyPay ?? 0,
  };

  const insertResult = await supabaseAdmin.from('users').insert(insertPayload);

  if (insertResult.error) {
    const message = insertResult.error.message?.toLowerCase() ?? '';
    if (message.includes('pin_code') || message.includes('hourly_pay')) {
      const { pin_code, hourly_pay, ...withoutPin } = insertPayload;
      const pinFallbackResult = await supabaseAdmin.from('users').insert(withoutPin);
      if (pinFallbackResult.error) {
        await supabaseAdmin.auth.admin.deleteUser(newAuthUserId);
        return applySupabaseCookies(
          NextResponse.json({ error: pinFallbackResult.error.message }, { status: 400 }),
          response
        );
      }
      return applySupabaseCookies(NextResponse.json({ success: true }), response);
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
        hourly_pay: payload.hourlyPay ?? 0,
      };
      const legacyResult = await supabaseAdmin.from('users').insert(legacyPayload);
      if (legacyResult.error) {
        if (
          legacyResult.error.message?.toLowerCase().includes('pin_code') ||
          legacyResult.error.message?.toLowerCase().includes('hourly_pay')
        ) {
          const { pin_code, hourly_pay, ...legacyNoPin } = legacyPayload;
          const secondLegacy = await supabaseAdmin.from('users').insert(legacyNoPin);
          if (secondLegacy.error) {
            await supabaseAdmin.auth.admin.deleteUser(newAuthUserId);
            return applySupabaseCookies(
              NextResponse.json({ error: secondLegacy.error.message }, { status: 400 }),
              response
            );
          }
          return applySupabaseCookies(NextResponse.json({ success: true }), response);
        }
        await supabaseAdmin.auth.admin.deleteUser(newAuthUserId);
        return applySupabaseCookies(
          NextResponse.json({ error: legacyResult.error.message }, { status: 400 }),
          response
        );
      }
    } else {
      await supabaseAdmin.auth.admin.deleteUser(newAuthUserId);
      return applySupabaseCookies(
        NextResponse.json({ error: insertResult.error.message }, { status: 400 }),
        response
      );
    }
  }

  return applySupabaseCookies(NextResponse.json({ success: true }), response);
}
