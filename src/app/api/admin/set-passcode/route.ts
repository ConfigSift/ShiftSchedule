import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { applySupabaseCookies, createSupabaseRouteClient } from '@/lib/supabase/route';
import { jsonError } from '@/lib/apiResponses';
import { getUserRole } from '@/utils/role';
import { deriveAuthPasswordFromPin, isValidPin } from '@/utils/pin';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();
    const { userId, passcode, pinCode, organizationId } = payload;
    const pinValue = pinCode ?? passcode ?? '';

    if (!isValidPin(String(pinValue))) {
      return NextResponse.json({ error: 'PIN must be exactly 4 digits.' }, { status: 400 });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.' },
        { status: 500 }
      );
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { supabase, response } = createSupabaseRouteClient(req);
    const { data: authData, error: authError } = await supabase.auth.getUser();
    const requesterAuthId = authData.user?.id;
    if (!requesterAuthId) {
      const message =
        process.env.NODE_ENV === 'production'
          ? 'Not signed in. Please sign out/in again.'
          : authError?.message || 'Unauthorized.';
      return applySupabaseCookies(jsonError(message, 401), response);
    }

    if (!userId) {
      return applySupabaseCookies(jsonError('User ID is required.', 400), response);
    }

    const { data: targetRow, error: targetError } = await admin
      .from('users')
      .select('id, organization_id, real_email, email, role, auth_user_id')
      .eq('id', String(userId))
      .maybeSingle();
    if (targetError || !targetRow) {
      return applySupabaseCookies(
        NextResponse.json({ error: targetError?.message ?? 'Employee not found.' }, { status: 404 }),
        response
      );
    }

    const resolvedOrgId = targetRow.organization_id ?? null;
    if (!resolvedOrgId) {
      return applySupabaseCookies(jsonError('Organization is required.', 400), response);
    }

    if (organizationId && String(organizationId) !== String(resolvedOrgId)) {
      return applySupabaseCookies(jsonError('Target not in this organization.', 403), response);
    }

    const { data: requesterMembership, error: requesterMembershipError } = await supabase
      .from('organization_memberships')
      .select('role')
      .eq('auth_user_id', requesterAuthId)
      .eq('organization_id', resolvedOrgId)
      .maybeSingle();

    if (requesterMembershipError || !requesterMembership) {
      return applySupabaseCookies(jsonError('Insufficient permissions.', 403), response);
    }

    const requesterRole = String(requesterMembership.role ?? '').trim().toLowerCase();
    if (requesterRole !== 'admin' && requesterRole !== 'manager') {
      return applySupabaseCookies(jsonError('Insufficient permissions.', 403), response);
    }

    const targetRole = getUserRole(targetRow.role);
    if (requesterRole === 'manager' && targetRole === 'ADMIN') {
      return applySupabaseCookies(jsonError('Managers cannot reset admin PINs.', 403), response);
    }

    const resolvedEmail = String(targetRow.real_email ?? targetRow.email ?? '').trim().toLowerCase();
    if (!resolvedEmail) {
      return applySupabaseCookies(jsonError('Target email missing.', 400), response);
    }
    if (resolvedEmail.startsWith('emp_') || resolvedEmail.endsWith('@pin.shiftflow.local')) {
      return applySupabaseCookies(
        NextResponse.json({ error: 'Synthetic auth emails are not allowed.' }, { status: 400 }),
        response
      );
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(resolvedEmail)) {
      return applySupabaseCookies(jsonError('Please enter a valid email address.', 400), response);
    }

    let resolvedAuthUserId: string | null = null;
    let resolvedAuthUserEmail: string | null = null;
    let authUserFound = false;
    const adminAuth: any = admin.auth.admin;

    if (targetRow.auth_user_id) {
      const { data: authById, error: authByIdError } = await adminAuth.getUserById(
        targetRow.auth_user_id
      );
      if (authByIdError) {
        return applySupabaseCookies(
          NextResponse.json({ error: authByIdError.message }, { status: 500 }),
          response
        );
      }
      if (authById?.user?.id) {
        resolvedAuthUserId = authById.user.id;
        resolvedAuthUserEmail = String(authById.user.email ?? '').toLowerCase();
        authUserFound = true;
      }
    }

    if (!authUserFound && typeof adminAuth.getUserByEmail === 'function') {
      const { data: existingAuth, error: existingAuthError } = await adminAuth.getUserByEmail(resolvedEmail);
      if (existingAuthError) {
        return applySupabaseCookies(
          NextResponse.json({ error: existingAuthError.message }, { status: 500 }),
          response
        );
      }
      if (existingAuth?.user?.id) {
        resolvedAuthUserId = existingAuth.user.id;
        resolvedAuthUserEmail = String(existingAuth.user.email ?? '').toLowerCase();
        authUserFound = true;
      }
    } else if (!authUserFound && typeof adminAuth.listUsers === 'function') {
      const { data: listData, error: listErr } = await adminAuth.listUsers({ page: 1, perPage: 1000 });
      if (listErr) {
        return applySupabaseCookies(
          NextResponse.json({ error: listErr.message }, { status: 500 }),
          response
        );
      }
      const match = (listData?.users ?? []).find(
        (user: any) => String(user.email ?? '').toLowerCase() === resolvedEmail
      );
      if (match?.id) {
        resolvedAuthUserId = match.id;
        resolvedAuthUserEmail = String(match.email ?? '').toLowerCase();
        authUserFound = true;
      }
    }

    if (authUserFound && resolvedAuthUserId) {
      const syntheticEmail =
        resolvedAuthUserEmail &&
        (resolvedAuthUserEmail.startsWith('emp_') ||
          resolvedAuthUserEmail.endsWith('@pin.shiftflow.local'));
      if (syntheticEmail) {
        const previousEmail = resolvedAuthUserEmail;
        const { error: emailUpdateError } = await admin.auth.admin.updateUserById(
          resolvedAuthUserId,
          { email: resolvedEmail, email_confirm: true }
        );
        if (emailUpdateError) {
          return applySupabaseCookies(
            NextResponse.json({ error: emailUpdateError.message }, { status: 500 }),
            response
          );
        }
        resolvedAuthUserEmail = resolvedEmail;
        if (process.env.NODE_ENV !== 'production') {
          console.debug('[set-passcode] migrated auth email', {
            from: previousEmail,
            to: resolvedEmail,
            authUserId: resolvedAuthUserId,
          });
        }
      }
      const { error: updErr } = await admin.auth.admin.updateUserById(resolvedAuthUserId, {
        password: deriveAuthPasswordFromPin(String(pinValue)),
      });
      if (updErr) {
        return applySupabaseCookies(
          NextResponse.json({ error: updErr.message }, { status: 500 }),
          response
        );
      }
    } else {
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email: resolvedEmail,
        password: deriveAuthPasswordFromPin(String(pinValue)),
        email_confirm: true,
      });
      if (createErr || !created.user?.id) {
        return applySupabaseCookies(
          NextResponse.json({ error: createErr?.message ?? 'Unable to create auth user.' }, { status: 500 }),
          response
        );
      }
      resolvedAuthUserId = created.user.id;
    }

    if (!resolvedAuthUserId) {
      return applySupabaseCookies(
        NextResponse.json({ error: 'Auth user missing.' }, { status: 500 }),
        response
      );
    }

    if (targetRow.auth_user_id !== resolvedAuthUserId) {
      const { error: updateUserError } = await admin
        .from('users')
        .update({ auth_user_id: resolvedAuthUserId })
        .eq('id', targetRow.id);
      if (updateUserError) {
        return applySupabaseCookies(
          NextResponse.json({ error: updateUserError.message }, { status: 500 }),
          response
        );
      }
    }

    const membershipRole = String(targetRow.role ?? 'employee').trim().toLowerCase() || 'employee';
    const { error: membershipError } = await admin
      .from('organization_memberships')
      .upsert(
        {
          organization_id: resolvedOrgId,
          auth_user_id: resolvedAuthUserId,
          role: membershipRole,
        },
        { onConflict: 'organization_id,auth_user_id' }
      );

    if (membershipError) {
      return applySupabaseCookies(
        NextResponse.json({ error: membershipError.message }, { status: 400 }),
        response
      );
    }

    if (process.env.NODE_ENV !== 'production') {
      console.debug('[set-passcode]', {
        resolvedEmail,
        resolvedAuthUserId,
        organizationId: resolvedOrgId,
      });
    }

    return applySupabaseCookies(NextResponse.json({ ok: true }), response);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Unknown error.' }, { status: 500 });
  }
}
