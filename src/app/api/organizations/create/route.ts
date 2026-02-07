import { NextRequest, NextResponse } from 'next/server';
import { applySupabaseCookies, createSupabaseRouteClient } from '@/lib/supabase/route';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { jsonError } from '@/lib/apiResponses';
import { generateRestaurantCode } from '@/utils/restaurantCode';
import { splitFullName } from '@/utils/userMapper';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type CreatePayload = {
  name: string;
};

export async function POST(request: NextRequest) {
  const payload = (await request.json()) as CreatePayload;
  const name = String(payload?.name ?? '').trim();
  if (!name) {
    return NextResponse.json({ error: 'Restaurant name is required.' }, { status: 400 });
  }

  const { supabase, response } = createSupabaseRouteClient(request);
  const { data: authData, error: authError } = await supabase.auth.getUser();
  const authUserId = authData.user?.id;
  if (!authUserId) {
    const message =
      process.env.NODE_ENV === 'production'
        ? 'Not signed in. Please sign out/in again.'
        : authError?.message || 'Unauthorized.';
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.error('[organizations:create] auth failed', { message });
    }
    return applySupabaseCookies(jsonError(message, 401), response);
  }

  const { data: membershipRows, error: membershipError } = await supabase
    .from('organization_memberships')
    .select('role')
    .eq('auth_user_id', authUserId);

  if (membershipError) {
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.error('[organizations:create] membership lookup failed', membershipError);
    }
    return applySupabaseCookies(
      NextResponse.json({ error: membershipError.message }, { status: 400 }),
      response
    );
  }

  const membershipCount = membershipRows?.length ?? 0;
  const hasAdminMembership = membershipRows?.some(
    (row) => String(row.role ?? '').trim().toLowerCase() === 'admin'
  );

  if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.error('[organizations:create] membership check', {
      membershipCount,
      decision: membershipCount === 0 ? 'bootstrap-first-restaurant' : hasAdminMembership ? 'admin-allowed' : 'blocked-non-admin',
    });
  }

  if (membershipCount > 0 && !hasAdminMembership) {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Only admins can create additional restaurants.' }, { status: 403 }),
      response
    );
  }

  const { data: requesterRows, error: requesterError } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('auth_user_id', authUserId)
    .limit(1);

  if (requesterError && process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.error('[organizations:create] requester lookup failed', requesterError);
  }

  const requesterRow = requesterRows?.[0] ?? null;
  const authUser = authData.user;
  const authEmail = String(authUser?.email ?? '').trim();
  const authMeta = (authUser?.user_metadata ?? {}) as Record<string, any>;
  const fallbackFullName = String(
    authMeta.full_name ?? authMeta.fullName ?? authMeta.name ?? authEmail.split('@')[0] ?? 'Team Member'
  ).trim();
  const fallbackPhone = String(authUser?.phone ?? authMeta.phone ?? '').trim();

  let createdOrg: { id: string; name: string; restaurant_code: string } | null = null;
  let lastError: { code?: string; message?: string } | null = null;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = generateRestaurantCode();
    const { data, error } = await supabaseAdmin
      .from('organizations')
      .insert({ name, restaurant_code: candidate })
      .select('id,name,restaurant_code')
      .single();

    if (!error && data) {
      createdOrg = data;
      break;
    }

    lastError = error ?? null;
    if (error?.code === '23505' || error?.message?.toLowerCase().includes('duplicate')) {
      continue;
    }

    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.error('[organizations:create] org insert failed', {
        code: error?.code,
        message: error?.message,
      });
    }
    return applySupabaseCookies(
      NextResponse.json({ error: error?.message ?? 'Unable to create restaurant.' }, { status: 400 }),
      response
    );
  }

  if (!createdOrg) {
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.error('[organizations:create] org insert exhausted', lastError);
    }
    return applySupabaseCookies(
      NextResponse.json({ error: lastError?.message ?? 'Unable to generate a unique restaurant code.' }, { status: 400 }),
      response
    );
  }

  const membershipRole = 'admin';
  const { data: membershipRow, error: membershipInsertError } = await supabaseAdmin
    .from('organization_memberships')
    .upsert(
      {
        organization_id: createdOrg.id,
        auth_user_id: authUserId,
        role: membershipRole,
      },
      { onConflict: 'organization_id,auth_user_id' }
    )
    .select('organization_id,auth_user_id,role')
    .single();

  if (membershipInsertError) {
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.error('[organizations:create] membership insert failed', {
        role: membershipRole,
        error: membershipInsertError,
      });
    }
    await supabaseAdmin.from('organizations').delete().eq('id', createdOrg.id);
    return applySupabaseCookies(
      NextResponse.json({ error: membershipInsertError.message }, { status: 400 }),
      response
    );
  }

  let employeeNumberToAssign: string | null = null;
  let employeeNumberSupported = true;
  let existingEmployeeNumber: number | null = null;

  const { data: existingProfileRow, error: existingProfileError } = await supabaseAdmin
    .from('users')
    .select('employee_number')
    .eq('organization_id', createdOrg.id)
    .eq('auth_user_id', authUserId)
    .maybeSingle();

  if (existingProfileError) {
    const message = String(existingProfileError.message ?? '').toLowerCase();
    if (message.includes('column') && message.includes('employee_number')) {
      employeeNumberSupported = false;
      if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.warn('[org-create] employee_id skipped (no column)');
      }
    }
  } else if (existingProfileRow && existingProfileRow.employee_number !== null && existingProfileRow.employee_number !== undefined) {
    existingEmployeeNumber = Number(existingProfileRow.employee_number);
  }

  if (employeeNumberSupported && existingEmployeeNumber === null) {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const candidateNumber = Math.floor(Math.random() * 10000);
      if (candidateNumber === 0 || candidateNumber === 9999) continue;
      const candidate = String(candidateNumber).padStart(4, '0');

      const { count, error: countError } = await supabaseAdmin
        .from('users')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', createdOrg.id)
        .eq('employee_number', candidateNumber);

      if (countError) {
        const message = String(countError.message ?? '').toLowerCase();
        if (message.includes('column') && message.includes('employee_number')) {
          employeeNumberSupported = false;
          if (process.env.NODE_ENV !== 'production') {
            // eslint-disable-next-line no-console
            console.warn('[org-create] employee_id skipped (no column)');
          }
          break;
        }
        continue;
      }

      if ((count ?? 0) === 0) {
        employeeNumberToAssign = candidate;
        if (process.env.NODE_ENV !== 'production') {
          // eslint-disable-next-line no-console
          console.log('[org-create] assigned employee_id', candidate, 'for org', createdOrg.id);
        }
        break;
      }
    }
  }

  const normalizedEmail = String(requesterRow?.email ?? authEmail).trim().toLowerCase();
  const fullName = String(requesterRow?.full_name ?? fallbackFullName).trim() || 'Team Member';
  const insertPayload: Record<string, unknown> = {
    auth_user_id: authUserId,
    organization_id: createdOrg.id,
    email: normalizedEmail || null,
    phone: requesterRow?.phone ?? fallbackPhone,
    full_name: fullName,
    role: membershipRole,
    jobs: requesterRow?.jobs ?? [],
  };
  if (employeeNumberSupported && employeeNumberToAssign) {
    insertPayload.employee_number = Number(employeeNumberToAssign);
  }

  const userResult = await (supabaseAdmin as any)
    .from('users')
    .upsert(insertPayload, { onConflict: 'organization_id,auth_user_id' });

  if (userResult.error) {
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.error('[organizations:create] user upsert failed', userResult.error);
    }
    const errorMessage = userResult.error.message ?? 'Unable to attach admin profile.';
    const lowerMessage = errorMessage.toLowerCase();
    const fallbackNeeded = lowerMessage.includes('full_name');

    if (!fallbackNeeded) {
      await supabaseAdmin.from('organization_memberships').delete().eq('organization_id', createdOrg.id);
      await supabaseAdmin.from('organizations').delete().eq('id', createdOrg.id);
      return applySupabaseCookies(NextResponse.json({ error: errorMessage }, { status: 400 }), response);
    }

    const { firstName, lastName } = splitFullName(fullName);
    const legacyPayload: Record<string, unknown> = {
      auth_user_id: authUserId,
      organization_id: createdOrg.id,
      email: normalizedEmail || null,
      phone: requesterRow?.phone ?? fallbackPhone,
      first_name: firstName,
      last_name: lastName,
      role: membershipRole,
      jobs: requesterRow?.jobs ?? [],
    };
    if (employeeNumberSupported && employeeNumberToAssign) {
      legacyPayload.employee_number = Number(employeeNumberToAssign);
    }
    const legacyResult = await (supabaseAdmin as any)
      .from('users')
      .upsert(legacyPayload, { onConflict: 'organization_id,auth_user_id' });

    if (legacyResult.error) {
      if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.error('[organizations:create] user upsert legacy failed', legacyResult.error);
      }
      await supabaseAdmin.from('organization_memberships').delete().eq('organization_id', createdOrg.id);
      await supabaseAdmin.from('organizations').delete().eq('id', createdOrg.id);
      return applySupabaseCookies(
        NextResponse.json({ error: legacyResult.error.message }, { status: 400 }),
        response
      );
    }
  }

  return applySupabaseCookies(
    NextResponse.json({
      id: createdOrg.id,
      name: createdOrg.name,
      restaurant_code: createdOrg.restaurant_code,
      role: membershipRole,
      createdOrg,
      membership: membershipRow ?? {
        organization_id: createdOrg.id,
        auth_user_id: authUserId,
        role: membershipRole,
      },
    }),
    response
  );
}
