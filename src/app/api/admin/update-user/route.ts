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
    for (const removedJob of removedJobs) {
      const { data: futureShifts, error: shiftError } = await supabaseAdmin
        .from('shifts')
        .select('id, shift_date, start_time')
        .eq('user_id', payload.userId)
        .eq('job', removedJob)
        .or(`shift_date.gt.${new Date().toISOString().split('T')[0]},and(shift_date.eq.${new Date().toISOString().split('T')[0]},start_time.gt.${new Date().toTimeString().slice(0, 8)})`)
        .order('shift_date', { ascending: true })
        .order('start_time', { ascending: true })
        .limit(1);

      if (!shiftError && futureShifts && futureShifts.length > 0) {
        // Count total future shifts for this job
        const { count } = await supabaseAdmin
          .from('shifts')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', payload.userId)
          .eq('job', removedJob)
          .or(`shift_date.gt.${new Date().toISOString().split('T')[0]},and(shift_date.eq.${new Date().toISOString().split('T')[0]},start_time.gt.${new Date().toTimeString().slice(0, 8)})`);

        return applySupabaseCookies(
          NextResponse.json({
            error: `Cannot remove "${removedJob}" - ${count ?? 1} future shift(s) use this job. Reassign or delete them first.`,
            code: 'JOB_REMOVAL_BLOCKED',
            job: removedJob,
            count: count ?? 1,
            earliest: {
              shift_date: futureShifts[0].shift_date,
              start_time: futureShifts[0].start_time,
            },
          }, { status: 400 }),
          response
        );
      }
    }
  }

  const jobsPayload = serializeJobsForStorage(targetRow.jobs, normalizedJobs);

  const hourlyPayValue = payload.hourlyPay ?? targetRow.hourly_pay ?? 0;

  // Sanitize jobPay: ensure it's a valid Record<string, number> with no NaN values
  let sanitizedJobPay: Record<string, number> | undefined;
  if (payload.jobPay && typeof payload.jobPay === 'object') {
    sanitizedJobPay = {};
    for (const [job, rate] of Object.entries(payload.jobPay)) {
      const numRate = Number(rate);
      if (Number.isFinite(numRate) && numRate >= 0) {
        sanitizedJobPay[job] = numRate;
      }
    }
    // If all values were invalid, don't save
    if (Object.keys(sanitizedJobPay).length === 0) {
      sanitizedJobPay = undefined;
    }
  }

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
  if (sanitizedJobPay !== undefined) {
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

  return applySupabaseCookies(NextResponse.json({ success: true }), response);
}
