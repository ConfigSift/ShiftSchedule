import { NextRequest, NextResponse } from 'next/server';
import { applySupabaseCookies, createSupabaseRouteClient } from '@/lib/supabase/route';
import { jsonError } from '@/lib/apiResponses';
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
  email?: string;
  phone?: string;
  accountType?: string;
  jobs?: string[];
  passcode?: string;
  hourlyPay?: number;
  jobPay?: Record<string, number>;
};

export async function POST(request: NextRequest) {
  const payload = (await request.json()) as UpdatePayload;
  const allowAdminCreation = process.env.ENABLE_ADMIN_CREATION === 'true';

  if (!payload.userId || !payload.organizationId || !payload.fullName) {
    return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 });
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
  const isSelfUpdate = requester.id === payload.userId;

  // Allow self-updates or manager/admin updates
  if (!isManagerRole(requesterRole) && !isSelfUpdate) {
    return applySupabaseCookies(jsonError('Insufficient permissions.', 403), response);
  }

  if (requester.organizationId !== payload.organizationId) {
    return applySupabaseCookies(jsonError('Organization mismatch.', 403), response);
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
    return applySupabaseCookies(jsonError('Target not in this organization.', 403), response);
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
    return applySupabaseCookies(jsonError('Managers cannot edit admins.', 403), response);
  }

  if (requesterRole === 'MANAGER' && targetRole === 'ADMIN') {
    return applySupabaseCookies(jsonError('Managers cannot assign ADMIN.', 403), response);
  }

  if (requesterRole === 'MANAGER' && targetRole !== 'MANAGER' && targetRole !== 'EMPLOYEE') {
    return applySupabaseCookies(
      jsonError('Managers can only assign MANAGER or EMPLOYEE.', 403),
      response
    );
  }

  if (payload.accountType && targetRole === 'ADMIN' && !allowAdminCreation) {
    return applySupabaseCookies(jsonError('Admin updates are disabled.', 403), response);
  }

  if (requesterRole === 'ADMIN' && target.authUserId === authUserId && targetRole !== 'ADMIN') {
    return applySupabaseCookies(jsonError('Admins cannot demote themselves.', 403), response);
  }
  if (target.authUserId === authUserId && payload.accountType && targetRole !== targetCurrentRole) {
    return applySupabaseCookies(jsonError('You cannot change your own account type.', 403), response);
  }

  // Employees doing self-updates can only change name, email, phone
  if (isSelfUpdate && !isManagerRole(requesterRole)) {
    if (payload.accountType || payload.jobs || payload.hourlyPay !== undefined || payload.jobPay || payload.passcode) {
      return applySupabaseCookies(jsonError('You can only update your name, email, and phone.', 403), response);
    }
  }

  const normalizedJobs = payload.jobs ? normalizeJobs(payload.jobs) : normalizeJobs(targetRow.jobs);
  if ((targetRole === 'EMPLOYEE' || targetRole === 'MANAGER') && normalizedJobs.length === 0) {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Managers and employees must have at least one job.' }, { status: 400 }),
      response
    );
  }

  // Detect removed jobs and check for future shifts
  const currentJobs = normalizeJobs(targetRow.jobs);
  const removedJobs = currentJobs.filter((job) => !normalizedJobs.includes(job));

  if (removedJobs.length > 0) {
    const today = new Date().toISOString().split('T')[0];

    // Query future shifts for ALL removed jobs at once
    const { data: futureShifts, error: shiftError } = await supabaseAdmin
      .from('shifts')
      .select('id, shift_date, job')
      .eq('user_id', payload.userId)
      .gt('shift_date', today)
      .in('job', removedJobs)
      .order('shift_date', { ascending: true })
      .limit(10);

    if (!shiftError && futureShifts && futureShifts.length > 0) {
      // Get total count
      const { count } = await supabaseAdmin
        .from('shifts')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', payload.userId)
        .gt('shift_date', today)
        .in('job', removedJobs);

      const jobsInUse = [...new Set(futureShifts.map((s) => s.job))];
      const exampleDates = [...new Set(futureShifts.slice(0, 5).map((s) => s.shift_date))];
      const earliestDate = futureShifts.reduce<string | null>((earliest, shift) => {
        if (!shift.shift_date) return earliest;
        if (!earliest || shift.shift_date < earliest) return shift.shift_date;
        return earliest;
      }, null);

      return applySupabaseCookies(
        NextResponse.json({
          error: `Cannot remove job(s): ${jobsInUse.join(', ')}. Employee is scheduled for ${count ?? futureShifts.length} future shift(s) with those job roles. Remove/reassign those shifts first.`,
          code: 'JOB_IN_USE',
          removedJobs: jobsInUse,
          count: count ?? futureShifts.length,
          exampleDates,
          earliestDate,
        }, { status: 400 }),
        response
      );
    }
  }

  const jobsPayload = serializeJobsForStorage(targetRow.jobs, normalizedJobs);

  // Sanitize jobPay: ensure it's a valid Record<string, number> with no NaN values
  let sanitizedJobPay: Record<string, number> = {};
  const jobPayProvided = payload.jobPay !== undefined && payload.jobPay !== null && typeof payload.jobPay === 'object';
  if (jobPayProvided) {
    for (const [job, rate] of Object.entries(payload.jobPay as Record<string, number>)) {
      const numRate = Number(rate);
      if (Number.isFinite(numRate) && numRate >= 0) {
        sanitizedJobPay[job] = numRate;
      }
    }
  } else {
    sanitizedJobPay = {};
  }
  const payValues = Object.values(sanitizedJobPay);
  const hourlyPayValue = jobPayProvided
    ? (payValues.length > 0
        ? Math.round((payValues.reduce((sum, v) => sum + v, 0) / payValues.length) * 100) / 100
        : 0)
    : payload.hourlyPay ?? targetRow.hourly_pay ?? 0;

  const baseUpdatePayload: Record<string, unknown> = {
    full_name: payload.fullName,
    phone: payload.phone ?? '',
    account_type: targetRole,
    jobs: jobsPayload,
    hourly_pay: hourlyPayValue,
  };
  // Only include email if provided
  if (payload.email !== undefined) {
    baseUpdatePayload.email = payload.email;
  }
  // Store job_pay as JSONB (not stringified TEXT)
  if (jobPayProvided) {
    baseUpdatePayload.job_pay = sanitizedJobPay;
  }

  const updateResult = await supabaseAdmin
    .from('users')
    .update(baseUpdatePayload)
    .eq('id', payload.userId);

  if (updateResult.error) {
    const message = updateResult.error.message?.toLowerCase() ?? '';
    if (message.includes('full_name') || message.includes('account_type') || message.includes('hourly_pay')) {
      const safeHourlyPay = message.includes('hourly_pay') ? undefined : hourlyPayValue;
      const { firstName, lastName } = splitFullName(payload.fullName);
      const legacyResult = await supabaseAdmin
        .from('users')
        .update({
          first_name: firstName,
          last_name: lastName,
          phone: payload.phone ?? '',
          role: targetRole,
          jobs: jobsPayload,
          ...(safeHourlyPay === undefined ? {} : { hourly_pay: safeHourlyPay }),
          ...(payload.email !== undefined ? { email: payload.email } : {}),
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

  // Fetch and return the updated user so client can update state immediately
  const { data: updatedRow, error: fetchError } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('id', payload.userId)
    .single();

  if (fetchError || !updatedRow) {
    // Save succeeded but fetch failed - still return success
    return applySupabaseCookies(NextResponse.json({ success: true }), response);
  }

  return applySupabaseCookies(
    NextResponse.json({ success: true, user: normalizeUserRow(updatedRow) }),
    response
  );
}
