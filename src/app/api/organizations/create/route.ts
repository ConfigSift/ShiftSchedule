import { NextRequest, NextResponse } from 'next/server';
import { applySupabaseCookies, createSupabaseRouteClient } from '@/lib/supabase/route';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { jsonError } from '@/lib/apiResponses';
import { generateRestaurantCode } from '@/utils/restaurantCode';
import { normalizeUserRow, splitFullName } from '@/utils/userMapper';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type CreatePayload = {
  name: string;
};

const ALLOWED_CREATOR_ROLES = new Set(['admin', 'manager']);

function isAuthorizedRole(value: unknown): boolean {
  return ALLOWED_CREATOR_ROLES.has(String(value ?? '').trim().toLowerCase());
}

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
    return applySupabaseCookies(jsonError(message, 401), response);
  }

  const { data: membershipRows, error: membershipError } = await supabase
    .from('organization_memberships')
    .select('role')
    .eq('auth_user_id', authUserId);

  if (membershipError) {
    return applySupabaseCookies(
      NextResponse.json({ error: membershipError.message }, { status: 400 }),
      response
    );
  }

  if (!membershipRows?.some((row) => isAuthorizedRole(row.role))) {
    return applySupabaseCookies(jsonError('Not authorized to create restaurants.', 403), response);
  }

  const { data: requesterRow, error: requesterError } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('auth_user_id', authUserId)
    .maybeSingle();

  if (requesterError || !requesterRow) {
    return applySupabaseCookies(jsonError('Requester profile not found.', 403), response);
  }

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

    return applySupabaseCookies(
      NextResponse.json({ error: error?.message ?? 'Unable to create restaurant.' }, { status: 400 }),
      response
    );
  }

  if (!createdOrg) {
    return applySupabaseCookies(
      NextResponse.json({ error: lastError?.message ?? 'Unable to generate a unique restaurant code.' }, { status: 400 }),
      response
    );
  }

  const { error: membershipInsertError } = await supabaseAdmin
    .from('organization_memberships')
    .insert({
      organization_id: createdOrg.id,
      auth_user_id: authUserId,
      role: 'admin',
    });

  if (membershipInsertError) {
    await supabaseAdmin.from('organizations').delete().eq('id', createdOrg.id);
    return applySupabaseCookies(
      NextResponse.json({ error: membershipInsertError.message }, { status: 400 }),
      response
    );
  }

  const requester = normalizeUserRow(requesterRow);
  const insertPayload = {
    auth_user_id: authUserId,
    organization_id: createdOrg.id,
    email: requester.email,
    phone: requester.phone,
    full_name: requester.fullName,
    role: requester.role,
    jobs: requester.jobs ?? [],
  };

  const userResult = await (supabaseAdmin as any).from('users').insert(insertPayload);

  if (userResult.error) {
    const errorMessage = userResult.error.message ?? 'Unable to attach admin profile.';
    const lowerMessage = errorMessage.toLowerCase();
    const fallbackNeeded = lowerMessage.includes('full_name');

    if (!fallbackNeeded) {
      await supabaseAdmin.from('organization_memberships').delete().eq('organization_id', createdOrg.id);
      await supabaseAdmin.from('organizations').delete().eq('id', createdOrg.id);
      return applySupabaseCookies(NextResponse.json({ error: errorMessage }, { status: 400 }), response);
    }

    const { firstName, lastName } = splitFullName(requester.fullName);
    const legacyResult = await (supabaseAdmin as any).from('users').insert({
      auth_user_id: authUserId,
      organization_id: createdOrg.id,
      email: requester.email,
      phone: requester.phone,
      first_name: firstName,
      last_name: lastName,
      role: requester.role,
      jobs: requester.jobs ?? [],
    });

    if (legacyResult.error) {
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
      role: 'admin',
    }),
    response
  );
}
