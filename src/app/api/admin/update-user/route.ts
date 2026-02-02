import { NextRequest, NextResponse } from 'next/server';
import { applySupabaseCookies, createSupabaseRouteClient } from '@/lib/supabase/route';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getUserRole, isManagerRole } from '@/utils/role';
import { normalizeJobs, serializeJobsForStorage } from '@/utils/jobs';
import { normalizeUserRow, splitFullName } from '@/utils/userMapper';
import { isFourDigitPin, pinToAuthPassword } from '@/utils/pinAuth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type UpdatePayload = {
  userId: string;
  organizationId: string;
  fullName: string;
  email?: string;
  phone?: string;
  employeeNumber?: number;
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
    return applySupabaseCookies(NextResponse.json({ error: message }, { status: 401 }), response);
  }

  const { data: requesterMembership, error: requesterMembershipError } = await supabase
    .from('organization_memberships')
    .select('role')
    .eq('auth_user_id', authUserId)
    .eq('organization_id', payload.organizationId)
    .maybeSingle();

  if (requesterMembershipError || !requesterMembership) {
    return applySupabaseCookies(
      NextResponse.json({ error: 'You dont have permission for that action.' }, { status: 403 }),
      response
    );
  }

  const requesterRole = String(requesterMembership.role ?? '').trim().toUpperCase();

  if (payload.employeeNumber !== undefined) {
    const num = Number(payload.employeeNumber);
    if (!Number.isInteger(num) || num < 1 || num > 9999) {
      return applySupabaseCookies(
        NextResponse.json({ error: 'Employee number must be between 0001 and 9999.' }, { status: 400 }),
        response
      );
    }
  }

  const { data: targetRow, error: targetError } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('id', payload.userId)
    .eq('organization_id', payload.organizationId)
    .maybeSingle();

  if (targetError) {
    return applySupabaseCookies(
      NextResponse.json({ error: targetError.message }, { status: 400 }),
      response
    );
  }

  let targetProfileRow = targetRow;
  let targetAuthUserId = targetRow?.auth_user_id ?? null;

  if (!targetAuthUserId) {
    const { data: anyTargetRow, error: anyTargetError } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', payload.userId)
      .maybeSingle();
    if (anyTargetError) {
      return applySupabaseCookies(
        NextResponse.json({ error: anyTargetError.message }, { status: 400 }),
        response
      );
    }
    targetAuthUserId = anyTargetRow?.auth_user_id ?? null;
    if (!targetAuthUserId) {
      return applySupabaseCookies(
        NextResponse.json({ error: 'Target user not found.' }, { status: 404 }),
        response
      );
    }
    targetProfileRow = anyTargetRow ?? null;
  }

  const { data: targetMembership, error: targetMembershipError } = await supabaseAdmin
    .from('organization_memberships')
    .select('role')
    .eq('organization_id', payload.organizationId)
    .eq('auth_user_id', targetAuthUserId)
    .maybeSingle();

  if (targetMembershipError) {
    return applySupabaseCookies(
      NextResponse.json({ error: targetMembershipError.message }, { status: 400 }),
      response
    );
  }

  if (!targetMembership) {
    return applySupabaseCookies(
      NextResponse.json({ error: 'You dont have permission for that action.' }, { status: 403 }),
      response
    );
  }

  const isSelfUpdate = targetAuthUserId === authUserId;

  if (!isManagerRole(requesterRole) && !isSelfUpdate) {
    return applySupabaseCookies(
      NextResponse.json({ error: 'You dont have permission for that action.' }, { status: 403 }),
      response
    );
  }

  const membershipRole = getUserRole(targetMembership.role ?? 'EMPLOYEE');
  const existingRole = targetProfileRow
    ? getUserRole(targetProfileRow.account_type ?? targetProfileRow.role ?? membershipRole)
    : membershipRole;
  const rawRole = payload.accountType ?? existingRole;
  const targetCurrentRole = existingRole;
  const targetRole = getUserRole(rawRole);
  if (payload.accountType && !['ADMIN', 'MANAGER', 'EMPLOYEE', 'STAFF'].includes(String(payload.accountType).toUpperCase())) {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Invalid account type.' }, { status: 400 }),
      response
    );
  }

  if (requesterRole === 'MANAGER' && targetCurrentRole === 'ADMIN') {
    return applySupabaseCookies(
      NextResponse.json({ error: 'You dont have permission for that action.' }, { status: 403 }),
      response
    );
  }

  if (requesterRole === 'MANAGER' && targetRole === 'ADMIN') {
    return applySupabaseCookies(
      NextResponse.json({ error: 'You dont have permission for that action.' }, { status: 403 }),
      response
    );
  }

  if (requesterRole === 'MANAGER' && targetRole !== 'MANAGER' && targetRole !== 'EMPLOYEE') {
    return applySupabaseCookies(
      NextResponse.json({ error: 'You dont have permission for that action.' }, { status: 403 }),
      response
    );
  }

  if (payload.accountType && targetRole === 'ADMIN' && !allowAdminCreation) {
    return applySupabaseCookies(
      NextResponse.json({ error: 'You dont have permission for that action.' }, { status: 403 }),
      response
    );
  }

  if (requesterRole === 'ADMIN' && targetAuthUserId === authUserId && targetRole !== 'ADMIN') {
    return applySupabaseCookies(
      NextResponse.json({ error: 'You dont have permission for that action.' }, { status: 403 }),
      response
    );
  }
  if (targetAuthUserId === authUserId && payload.accountType && targetRole !== targetCurrentRole) {
    return applySupabaseCookies(
      NextResponse.json({ error: 'You dont have permission for that action.' }, { status: 403 }),
      response
    );
  }

  // Employees doing self-updates can only change name, email, phone
  if (isSelfUpdate && !isManagerRole(requesterRole)) {
    if (payload.accountType || payload.jobs || payload.hourlyPay !== undefined || payload.jobPay || payload.passcode) {
      return applySupabaseCookies(
        NextResponse.json({ error: 'You dont have permission for that action.' }, { status: 403 }),
        response
      );
    }
  }

  if (!targetRow) {
    const fullName = payload.fullName?.trim() || String(payload.email ?? '').trim() || 'Team Member';
    const normalizedEmail = String(payload.email ?? targetProfileRow?.email ?? '').trim().toLowerCase();
    const phone = String(payload.phone ?? targetProfileRow?.phone ?? '').trim();
    const profileRole = String(targetMembership.role ?? targetRole).trim() || targetRole;

    const insertPayload: Record<string, unknown> = {
      auth_user_id: targetAuthUserId,
      organization_id: payload.organizationId,
      full_name: fullName,
      email: normalizedEmail || null,
      real_email: normalizedEmail || null,
      role: profileRole,
    };
    if (phone) {
      insertPayload.phone = phone;
    }

    const insertResult = await supabaseAdmin.from('users').insert(insertPayload);
    if (insertResult.error) {
      const message = insertResult.error.message?.toLowerCase() ?? '';
      if (message.includes('full_name') || message.includes('first_name') || message.includes('last_name')) {
        const { firstName, lastName } = splitFullName(fullName);
        const legacyPayload: Record<string, unknown> = {
          auth_user_id: targetAuthUserId,
          organization_id: payload.organizationId,
          first_name: firstName,
          last_name: lastName,
          email: normalizedEmail || null,
          real_email: normalizedEmail || null,
          role: profileRole,
        };
        if (phone) {
          legacyPayload.phone = phone;
        }
        const legacyResult = await supabaseAdmin.from('users').insert(legacyPayload);
        if (legacyResult.error) {
          return applySupabaseCookies(
            NextResponse.json({ error: legacyResult.error.message }, { status: 400 }),
            response
          );
        }
      } else {
        return applySupabaseCookies(
          NextResponse.json({ error: insertResult.error.message }, { status: 400 }),
          response
        );
      }
    }

    const { data: refreshedRow, error: refreshError } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('organization_id', payload.organizationId)
      .eq('auth_user_id', targetAuthUserId)
      .maybeSingle();
    if (refreshError || !refreshedRow) {
      return applySupabaseCookies(
        NextResponse.json({ error: 'Target user not found.' }, { status: 404 }),
        response
      );
    }
    targetProfileRow = refreshedRow;
  }

  const target = normalizeUserRow(targetProfileRow);
  const normalizedJobs = payload.jobs ? normalizeJobs(payload.jobs) : normalizeJobs(targetProfileRow.jobs);
  if ((targetRole === 'EMPLOYEE' || targetRole === 'MANAGER') && normalizedJobs.length === 0) {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Managers and employees must have at least one job.' }, { status: 400 }),
      response
    );
  }

  // Detect removed jobs and check for future shifts
  const currentJobs = normalizeJobs(targetProfileRow.jobs);
  const removedJobs = currentJobs.filter((job) => !normalizedJobs.includes(job));

  if (removedJobs.length > 0) {
    const today = new Date().toISOString().split('T')[0];

    // Query future shifts for ALL removed jobs at once
    const { data: futureShifts, error: shiftError } = await supabaseAdmin
      .from('shifts')
      .select('id, shift_date, job')
      .eq('user_id', targetProfileRow.id)
      .gt('shift_date', today)
      .in('job', removedJobs)
      .order('shift_date', { ascending: true })
      .limit(10);

    if (!shiftError && futureShifts && futureShifts.length > 0) {
      // Get total count
      const { count } = await supabaseAdmin
        .from('shifts')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', targetProfileRow.id)
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

  const jobsPayload = serializeJobsForStorage(targetProfileRow.jobs, normalizedJobs);

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
    : payload.hourlyPay ?? targetProfileRow.hourly_pay ?? 0;

  const baseUpdatePayload: Record<string, unknown> = {
    full_name: payload.fullName,
    phone: payload.phone ?? '',
    role: targetRole,
    jobs: jobsPayload,
    hourly_pay: hourlyPayValue,
  };
  // Only include email if provided
  if (payload.email !== undefined) {
    baseUpdatePayload.email = payload.email;
  }
  if (payload.employeeNumber !== undefined) {
    baseUpdatePayload.employee_number = payload.employeeNumber;
  }
  // Store job_pay as JSONB (not stringified TEXT)
  if (jobPayProvided) {
    baseUpdatePayload.job_pay = sanitizedJobPay;
  }

  const updateResult = await supabaseAdmin
    .from('users')
    .update(baseUpdatePayload)
    .eq('organization_id', payload.organizationId)
    .eq('auth_user_id', targetAuthUserId);

  if (updateResult.error) {
    const message = updateResult.error.message?.toLowerCase() ?? '';
    if (message.includes('full_name') || message.includes('hourly_pay')) {
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
          ...(payload.employeeNumber !== undefined ? { employee_number: payload.employeeNumber } : {}),
          ...(jobPayProvided ? { job_pay: sanitizedJobPay } : {}),
        })
        .eq('organization_id', payload.organizationId)
        .eq('auth_user_id', targetAuthUserId);
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
    if (!isFourDigitPin(payload.passcode)) {
      return applySupabaseCookies(
        NextResponse.json({ error: 'PIN must be exactly 4 digits.' }, { status: 400 }),
        response
      );
    }
    if (!targetAuthUserId) {
      return applySupabaseCookies(
        NextResponse.json({ error: 'Target auth user missing.' }, { status: 400 }),
        response
      );
    }
    const { error: authUpdateError } = await supabaseAdmin.auth.admin.updateUserById(
      targetAuthUserId,
      { password: pinToAuthPassword(payload.passcode) }
    );
    if (authUpdateError) {
      const cleanMessage =
        authUpdateError.message?.toLowerCase().includes('password')
          ? 'PIN must be exactly 4 digits.'
          : authUpdateError.message;
      return applySupabaseCookies(
        NextResponse.json({ error: cleanMessage }, { status: 400 }),
        response
      );
    }
  }

  // Fetch and return the updated user so client can update state immediately
  const { data: updatedRow, error: fetchError } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('organization_id', payload.organizationId)
    .eq('auth_user_id', targetAuthUserId)
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
