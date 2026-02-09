import { NextRequest, NextResponse } from 'next/server';
import { applySupabaseCookies, createSupabaseRouteClient } from '@/lib/supabase/route';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getUserRole } from '@/utils/role';
import { normalizeJobs } from '@/utils/jobs';
import { splitFullName } from '@/utils/userMapper';
import { normalizeEmployeeNumber, validateEmployeeNumber } from '@/utils/employeeAuth';
import { deriveAuthPasswordFromPin, isValidPin } from '@/utils/pin';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type CreatePayload = {
  organizationId: string;
  fullName: string;
  phone?: string;
  email: string;
  employeeNumber?: number;
  accountType: string;
  jobs: string[];
  passcode?: string;
  pinCode?: string;
  hourlyPay?: number;
  jobPay?: Record<string, number>;
};

type CreateResponse = {
  created: boolean;
  invited: boolean;
  already_member: boolean;
  error?: string;
};

function isEmployeeNumberConflict(error: { code?: string | null; message?: string | null; details?: string | null }) {
  const code = error.code ?? '';
  const message = (error.message ?? '').toLowerCase();
  const details = (error.details ?? '').toLowerCase();
  const combined = `${message} ${details}`;
  if (code === '23505') {
    return combined.includes('users_org_employee_number_unique');
  }
  if (combined.includes('duplicate key value') && combined.includes('users_org_employee_number_unique')) {
    return true;
  }
  return false;
}

function sanitizeJobs(jobs: string[]) {
  return normalizeJobs(jobs);
}

async function findAuthUserIdByEmail(normalizedEmail: string): Promise<string | null> {
  const { data: userRow, error: userErr } = await supabaseAdmin
    .from('users')
    .select('auth_user_id')
    .or(`real_email.ilike.${normalizedEmail},email.ilike.${normalizedEmail}`)
    .limit(1)
    .maybeSingle();
  if (!userErr && userRow?.auth_user_id) {
    return userRow.auth_user_id;
  }

  const adminAuth: any = supabaseAdmin.auth.admin;
  if (typeof adminAuth.listUsers !== 'function') {
    return null;
  }

  const perPage = 200;
  let page = 1;
  while (true) {
    const { data: listData, error: listErr } = await adminAuth.listUsers({ page, perPage });
    if (listErr) {
      // eslint-disable-next-line no-console
      console.warn('[create-user] listUsers failed', listErr.message);
      return null;
    }
    const users = listData?.users ?? [];
    const match = users.find(
      (user: any) => String(user.email ?? '').toLowerCase() === normalizedEmail
    );
    if (match?.id) {
      return match.id;
    }
    if (users.length < perPage) {
      break;
    }
    page += 1;
  }

  return null;
}

export async function POST(request: NextRequest) {
  const { supabase, response } = createSupabaseRouteClient(request);
  const hasRefreshToken = request.cookies.getAll().some(
    (cookie) => cookie.name === 'sb-refresh-token' || cookie.name.endsWith('-refresh-token')
  );
  const respond = (res: NextResponse) => (hasRefreshToken ? applySupabaseCookies(res, response) : res);
  const toResponse = (payload: CreateResponse, status = 200) => {
    const { error, ...rest } = payload;
    const responseBody = error ? { ...rest, error } : rest;
    return respond(NextResponse.json(responseBody, { status }));
  };

  try {
    const payload = (await request.json()) as CreatePayload;
    const allowAdminCreation = process.env.ENABLE_ADMIN_CREATION === 'true';

    if (!payload.organizationId || !payload.fullName || !payload.email) {
      return toResponse(
        { created: false, invited: false, already_member: false, error: 'Missing required fields.' },
        400
      );
    }

    const pinValue = payload.pinCode ?? payload.passcode ?? '';
    if (!isValidPin(pinValue)) {
      return toResponse(
        { created: false, invited: false, already_member: false, error: 'PIN must be exactly 4 digits.' },
        400
      );
    }

    if (!validateEmployeeNumber(payload.employeeNumber)) {
      return toResponse(
        {
          created: false,
          invited: false,
          already_member: false,
          error: 'Employee number must be between 0001 and 9999.',
        },
        400
      );
    }

    const { data: authData, error: authError } = await supabase.auth.getUser();
    const authUserId = authData.user?.id;

    if (!authUserId) {
      const message =
        process.env.NODE_ENV === 'production'
          ? 'Not signed in. Please sign out/in again.'
          : authError?.message || 'Unauthorized.';
      return toResponse(
        { created: false, invited: false, already_member: false, error: message },
        401
      );
    }

    const { data: requesterMembership, error: requesterMembershipError } = await supabase
      .from('organization_memberships')
      .select('role')
      .eq('auth_user_id', authUserId)
      .eq('organization_id', payload.organizationId)
      .maybeSingle();

    if (requesterMembershipError || !requesterMembership) {
      return toResponse(
        { created: false, invited: false, already_member: false, error: 'Insufficient permissions.' },
        403
      );
    }

    const requesterMembershipRole = String(requesterMembership.role ?? '').trim().toLowerCase();
    if (requesterMembershipRole !== 'admin' && requesterMembershipRole !== 'manager') {
      return toResponse(
        { created: false, invited: false, already_member: false, error: 'Insufficient permissions.' },
        403
      );
    }

    const rawRole = String(payload.accountType ?? '').trim();
    const targetRole = getUserRole(rawRole);
    if (!rawRole || !['ADMIN', 'MANAGER', 'EMPLOYEE', 'STAFF'].includes(rawRole.toUpperCase())) {
      return toResponse(
        { created: false, invited: false, already_member: false, error: 'Invalid account type.' },
        400
      );
    }
    if (requesterMembershipRole === 'manager' && targetRole === 'ADMIN') {
      return toResponse(
        { created: false, invited: false, already_member: false, error: 'Managers cannot create admins.' },
        403
      );
    }
    if (targetRole === 'ADMIN' && !allowAdminCreation) {
      return toResponse(
        { created: false, invited: false, already_member: false, error: 'Admin creation is disabled.' },
        403
      );
    }

    const normalizedJobs = sanitizeJobs(payload.jobs ?? []);
    if ((targetRole === 'EMPLOYEE' || targetRole === 'MANAGER') && normalizedJobs.length === 0) {
      return toResponse(
        {
          created: false,
          invited: false,
          already_member: false,
          error: 'Managers and employees must have at least one job.',
        },
        400
      );
    }

    const employeeNumber = normalizeEmployeeNumber(payload.employeeNumber);
    if (!employeeNumber) {
      return toResponse(
        { created: false, invited: false, already_member: false, error: 'Invalid employee number.' },
        400
      );
    }

    const normalizedEmail = String(payload.email ?? '').trim().toLowerCase();
    if (!normalizedEmail) {
      return toResponse(
        { created: false, invited: false, already_member: false, error: 'Email is required.' },
        400
      );
    }
    if (normalizedEmail.startsWith('emp_') || normalizedEmail.endsWith('@pin.shiftflow.local')) {
      return toResponse(
        {
          created: false,
          invited: false,
          already_member: false,
          error: 'Synthetic auth emails are not allowed.',
        },
        400
      );
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      return toResponse(
        {
          created: false,
          invited: false,
          already_member: false,
          error: 'Please enter a valid email address.',
        },
        400
      );
    }

    let newAuthUserId: string | undefined;
    let createdAuthUser = false;
    const existingAuthUserId = await findAuthUserIdByEmail(normalizedEmail);
    if (existingAuthUserId) {
      const { data: existingMembership, error: membershipLookupError } = await supabaseAdmin
        .from('organization_memberships')
        .select('id, role')
        .eq('organization_id', payload.organizationId)
        .eq('auth_user_id', existingAuthUserId)
        .maybeSingle();

      if (membershipLookupError) {
        return toResponse(
          {
            created: false,
            invited: false,
            already_member: false,
            error: membershipLookupError.message,
          },
          400
        );
      }

      const { data: existingProfile, error: profileLookupError } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('organization_id', payload.organizationId)
        .eq('auth_user_id', existingAuthUserId)
        .maybeSingle();

      if (profileLookupError) {
        return toResponse(
          { created: false, invited: false, already_member: false, error: profileLookupError.message },
          400
        );
      }

      const membershipExists = !!existingMembership;
      const profileExists = !!existingProfile;

      if (membershipExists && profileExists) {
        return toResponse({ created: false, invited: false, already_member: true });
      }

      if (membershipExists && !profileExists) {
        const fullNameRaw = String(payload.fullName ?? '').trim();
        const fullName = fullNameRaw || normalizedEmail;
        const phone = String(payload.phone ?? '').trim();
        const profileRole = String(existingMembership?.role ?? targetRole).trim() || targetRole;

        const insertPayload: Record<string, unknown> = {
          auth_user_id: existingAuthUserId,
          organization_id: payload.organizationId,
          full_name: fullName,
          email: normalizedEmail,
          real_email: normalizedEmail,
          role: profileRole,
        };
        if (phone) {
          insertPayload.phone = phone;
        }

        const insertResult = await supabaseAdmin.from('users').insert(insertPayload);
        if (insertResult.error) {
          const message = insertResult.error.message?.toLowerCase() ?? '';
          if (
            message.includes('full_name')
            || message.includes('first_name')
            || message.includes('last_name')
          ) {
            const { firstName, lastName } = splitFullName(fullName);
            const legacyPayload: Record<string, unknown> = {
              auth_user_id: existingAuthUserId,
              organization_id: payload.organizationId,
              first_name: firstName,
              last_name: lastName,
              email: normalizedEmail,
              real_email: normalizedEmail,
              role: profileRole,
            };
            if (phone) {
              legacyPayload.phone = phone;
            }
            const legacyResult = await supabaseAdmin.from('users').insert(legacyPayload);
            if (legacyResult.error) {
              return toResponse(
                {
                  created: false,
                  invited: false,
                  already_member: false,
                  error: legacyResult.error.message,
                },
                400
              );
            }
          } else {
            return toResponse(
              { created: false, invited: false, already_member: false, error: insertResult.error.message },
              400
            );
          }
        }

        return toResponse({ created: false, invited: false, already_member: true });
      }

      const invitationRole = targetRole.toLowerCase();
      const { error: inviteError } = await supabaseAdmin
        .from('organization_invitations')
        .insert({
          organization_id: payload.organizationId,
          email: normalizedEmail,
          role: invitationRole,
          status: 'pending',
          invited_by_auth_user_id: authUserId,
        });

      if (inviteError) {
        const lowerMessage = inviteError.message?.toLowerCase() ?? '';
        if (inviteError.code === '23505' || lowerMessage.includes('duplicate')) {
          return toResponse({ created: false, invited: true, already_member: false });
        }
        return toResponse(
          { created: false, invited: false, already_member: false, error: inviteError.message },
          400
        );
      }

      return toResponse({ created: false, invited: true, already_member: false });
    }

    const { data: createData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: normalizedEmail,
      password: deriveAuthPasswordFromPin(pinValue),
      email_confirm: true,
    });
    if (createError) {
      const cleanMessage =
        createError.message?.toLowerCase().includes('password')
          ? 'PIN must be exactly 4 digits.'
          : createError.message;
      return toResponse(
        { created: false, invited: false, already_member: false, error: cleanMessage },
        400
      );
    }
    newAuthUserId = createData.user?.id;
    createdAuthUser = true;

    if (!newAuthUserId) {
      return toResponse(
        { created: false, invited: false, already_member: false, error: 'Failed to create auth user.' },
        500
      );
    }

    // Sanitize jobPay: ensure it's a valid Record<string, number> with no NaN values
    const sanitizedJobPay: Record<string, number> = {};
    const jobPayProvided = payload.jobPay !== undefined && payload.jobPay !== null && typeof payload.jobPay === 'object';
    if (jobPayProvided) {
      for (const [job, rate] of Object.entries(payload.jobPay as Record<string, number>)) {
        const numRate = Number(rate);
        if (Number.isFinite(numRate) && numRate >= 0) {
          sanitizedJobPay[job] = numRate;
        }
      }
    }
    const payValues = Object.values(sanitizedJobPay);
    const hourlyPayValue = jobPayProvided
      ? (payValues.length > 0
          ? Math.round((payValues.reduce((sum, v) => sum + v, 0) / payValues.length) * 100) / 100
          : 0)
      : payload.hourlyPay ?? 0;

    const insertPayload: Record<string, unknown> = {
      auth_user_id: newAuthUserId,
      organization_id: payload.organizationId,
      full_name: payload.fullName,
      phone: payload.phone ?? '',
      email: normalizedEmail,
      real_email: normalizedEmail,
      employee_number: employeeNumber,
      role: targetRole,
      jobs: normalizedJobs,
      hourly_pay: hourlyPayValue,
    };
    if (jobPayProvided) {
      insertPayload.job_pay = sanitizedJobPay;
    }

    let insertSucceeded = false;
    const insertResult = await supabaseAdmin.from('users').insert(insertPayload);

    if (insertResult.error) {
      if (isEmployeeNumberConflict(insertResult.error)) {
        if (createdAuthUser) {
          await supabaseAdmin.auth.admin.deleteUser(newAuthUserId);
        }
        return toResponse(
          {
            created: false,
            invited: false,
            already_member: false,
            code: 'EMPLOYEE_ID_TAKEN',
            field: 'employeeNumber',
            message: 'Employee ID already exists. Please choose a different ID.',
          } as any,
          409
        );
      }
      const message = insertResult.error.message?.toLowerCase() ?? '';
      if (message.includes('hourly_pay')) {
        const { hourly_pay, ...withoutPay } = insertPayload;
        const pinFallbackResult = await supabaseAdmin.from('users').insert(withoutPay);
        if (pinFallbackResult.error) {
          if (createdAuthUser) {
            await supabaseAdmin.auth.admin.deleteUser(newAuthUserId);
          }
          return toResponse(
            {
              created: false,
              invited: false,
              already_member: false,
              error: pinFallbackResult.error.message,
            },
            400
          );
        }
        insertSucceeded = true;
      } else if (message.includes('full_name')) {
        const { firstName, lastName } = splitFullName(payload.fullName);
        const legacyPayload: Record<string, unknown> = {
          auth_user_id: newAuthUserId,
          organization_id: payload.organizationId,
          first_name: firstName,
          last_name: lastName,
          phone: payload.phone ?? '',
          email: normalizedEmail,
          real_email: normalizedEmail,
          employee_number: employeeNumber,
          role: targetRole,
          jobs: normalizedJobs,
          hourly_pay: hourlyPayValue,
        };
        if (jobPayProvided) {
          legacyPayload.job_pay = sanitizedJobPay;
        }
        const legacyResult = await supabaseAdmin.from('users').insert(legacyPayload);
        if (legacyResult.error) {
          if (isEmployeeNumberConflict(legacyResult.error)) {
            if (createdAuthUser) {
              await supabaseAdmin.auth.admin.deleteUser(newAuthUserId);
            }
            return toResponse(
              {
                created: false,
                invited: false,
                already_member: false,
                code: 'EMPLOYEE_ID_TAKEN',
                field: 'employeeNumber',
                message: 'Employee ID already exists. Please choose a different ID.',
              } as any,
              409
            );
          }
          if (legacyResult.error.message?.toLowerCase().includes('hourly_pay')) {
            const { hourly_pay, ...legacyNoPay } = legacyPayload;
            const secondLegacy = await supabaseAdmin.from('users').insert(legacyNoPay);
            if (secondLegacy.error) {
              if (isEmployeeNumberConflict(secondLegacy.error)) {
                if (createdAuthUser) {
                  await supabaseAdmin.auth.admin.deleteUser(newAuthUserId);
                }
                return toResponse(
                  {
                    created: false,
                    invited: false,
                    already_member: false,
                    code: 'EMPLOYEE_ID_TAKEN',
                    field: 'employeeNumber',
                    message: 'Employee ID already exists. Please choose a different ID.',
                  } as any,
                  409
                );
              }
              if (createdAuthUser) {
                await supabaseAdmin.auth.admin.deleteUser(newAuthUserId);
              }
              return toResponse(
                {
                  created: false,
                  invited: false,
                  already_member: false,
                  error: secondLegacy.error.message,
                },
                400
              );
            }
            insertSucceeded = true;
          } else {
            if (createdAuthUser) {
              await supabaseAdmin.auth.admin.deleteUser(newAuthUserId);
            }
            return toResponse(
              { created: false, invited: false, already_member: false, error: legacyResult.error.message },
              400
            );
          }
        } else {
          insertSucceeded = true;
        }
      } else {
        if (createdAuthUser) {
          await supabaseAdmin.auth.admin.deleteUser(newAuthUserId);
        }
        return toResponse(
          { created: false, invited: false, already_member: false, error: insertResult.error.message },
          400
        );
      }
    } else {
      insertSucceeded = true;
    }

    if (!insertSucceeded) {
      if (createdAuthUser) {
        await supabaseAdmin.auth.admin.deleteUser(newAuthUserId);
      }
      return toResponse(
        { created: false, invited: false, already_member: false, error: 'Unable to create user.' },
        400
      );
    }

    const membershipRole = targetRole.toLowerCase();
    const { error: membershipError } = await supabaseAdmin
      .from('organization_memberships')
      .upsert(
        {
          organization_id: payload.organizationId,
          auth_user_id: newAuthUserId,
          role: membershipRole,
        },
        { onConflict: 'organization_id,auth_user_id' }
      );

    if (membershipError) {
      await supabaseAdmin
        .from('users')
        .delete()
        .eq('organization_id', payload.organizationId)
        .eq('auth_user_id', newAuthUserId);
      if (createdAuthUser) {
        await supabaseAdmin.auth.admin.deleteUser(newAuthUserId);
      }
      return toResponse(
        { created: false, invited: false, already_member: false, error: membershipError.message },
        400
      );
    }

    return toResponse({ created: true, invited: false, already_member: false });
  } catch (e: any) {
    const message = e?.message ?? 'Unknown error.';
    return toResponse(
      { created: false, invited: false, already_member: false, error: message },
      500
    );
  }
}
