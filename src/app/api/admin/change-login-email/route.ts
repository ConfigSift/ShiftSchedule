import { NextRequest, NextResponse } from 'next/server';
import { applySupabaseCookies, createSupabaseRouteClient } from '@/lib/supabase/route';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getBaseUrls } from '@/lib/routing/getBaseUrls';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type ChangeLoginEmailPayload = {
  targetAuthUserId?: string;
  newEmail?: string;
};

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function resolveResetRedirect(request: NextRequest) {
  const forwardedHost = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? '';
  const forwardedProto = request.headers.get('x-forwarded-proto') ?? '';
  const requestOrigin = forwardedHost
    ? `${forwardedProto || 'https'}://${forwardedHost}`
    : request.nextUrl.origin;
  const { loginBaseUrl } = getBaseUrls(requestOrigin);
  return `${loginBaseUrl}/reset-passcode`;
}

export async function POST(request: NextRequest) {
  const { supabase, response } = createSupabaseRouteClient(request);
  const hasRefreshToken = request.cookies.getAll().some(
    (cookie) => cookie.name === 'sb-refresh-token' || cookie.name.endsWith('-refresh-token')
  );
  const respond = (res: NextResponse) => (hasRefreshToken ? applySupabaseCookies(res, response) : res);

  try {
    const payload = (await request.json()) as ChangeLoginEmailPayload;
    const targetAuthUserId = String(payload.targetAuthUserId ?? '').trim();
    const newEmail = String(payload.newEmail ?? '').trim().toLowerCase();

    if (!targetAuthUserId || !newEmail) {
      return respond(
        NextResponse.json(
          { ok: false, code: 'MISSING_FIELDS', message: 'targetAuthUserId and newEmail are required.' },
          { status: 400 }
        )
      );
    }

    if (!isUuid(targetAuthUserId)) {
      return respond(
        NextResponse.json(
          { ok: false, code: 'INVALID_TARGET_AUTH_USER_ID', message: 'targetAuthUserId must be a UUID.' },
          { status: 422 }
        )
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail)) {
      return respond(
        NextResponse.json({ ok: false, code: 'INVALID_EMAIL', message: 'Please enter a valid email address.' }, { status: 400 })
      );
    }

    const { data: authData, error: authError } = await supabase.auth.getUser();
    const requesterAuthUserId = authData.user?.id;
    if (!requesterAuthUserId) {
      const message =
        process.env.NODE_ENV === 'production'
          ? 'Not signed in. Please sign out/in again.'
          : authError?.message || 'Unauthorized.';
      return respond(NextResponse.json({ ok: false, code: 'UNAUTHORIZED', message }, { status: 401 }));
    }

    const { data: requesterAdminMemberships, error: requesterMembershipError } = await supabase
      .from('organization_memberships')
      .select('organization_id')
      .eq('auth_user_id', requesterAuthUserId)
      .eq('role', 'admin');

    if (requesterMembershipError) {
      return respond(
        NextResponse.json(
          { ok: false, code: 'MEMBERSHIP_LOOKUP_FAILED', message: requesterMembershipError.message },
          { status: 400 }
        )
      );
    }

    const requesterAdminOrgIds = new Set(
      (requesterAdminMemberships ?? [])
        .map((row: { organization_id?: string | null }) => String(row.organization_id ?? '').trim())
        .filter((value: string) => value.length > 0)
    );
    if (requesterAdminOrgIds.size === 0) {
      return respond(
        NextResponse.json({ ok: false, code: 'FORBIDDEN', message: 'Admin access is required.' }, { status: 403 })
      );
    }

    const { data: targetMemberships, error: targetMembershipError } = await supabaseAdmin
      .from('organization_memberships')
      .select('organization_id')
      .eq('auth_user_id', targetAuthUserId);

    if (targetMembershipError) {
      return respond(
        NextResponse.json(
          { ok: false, code: 'TARGET_MEMBERSHIP_LOOKUP_FAILED', message: targetMembershipError.message },
          { status: 400 }
        )
      );
    }

    const targetOrgIds = new Set(
      (targetMemberships ?? [])
        .map((row: { organization_id?: string | null }) => String(row.organization_id ?? '').trim())
        .filter((value: string) => value.length > 0)
    );
    if (targetOrgIds.size === 0) {
      return respond(
        NextResponse.json({ ok: false, code: 'TARGET_NOT_FOUND', message: 'Target user not found.' }, { status: 404 })
      );
    }

    const sharedAdminOrg = Array.from(targetOrgIds).some((orgId) => requesterAdminOrgIds.has(orgId));
    if (!sharedAdminOrg) {
      return respond(
        NextResponse.json(
          { ok: false, code: 'FORBIDDEN', message: 'You can only change login email for staff in your organization.' },
          { status: 403 }
        )
      );
    }

    const { error: authUpdateError } = await supabaseAdmin.auth.admin.updateUserById(targetAuthUserId, {
      email: newEmail,
    });
    if (authUpdateError) {
      return respond(
        NextResponse.json(
          { ok: false, code: 'AUTH_EMAIL_UPDATE_FAILED', message: authUpdateError.message || 'Unable to update login email.' },
          { status: 400 }
        )
      );
    }

    const { error: recoveryError } = await supabaseAdmin.auth.resetPasswordForEmail(newEmail, {
      redirectTo: resolveResetRedirect(request),
    });
    if (recoveryError) {
      return respond(
        NextResponse.json(
          { ok: false, code: 'AUTH_EMAIL_LINK_FAILED', message: recoveryError.message || 'Unable to send email link.' },
          { status: 400 }
        )
      );
    }

    const nowIso = new Date().toISOString();
    const { error: updateUserError } = await supabaseAdmin
      .from('users')
      .update({
        email: newEmail,
        real_email: newEmail,
        updated_at: nowIso,
      })
      .eq('auth_user_id', targetAuthUserId);

    if (updateUserError) {
      return respond(
        NextResponse.json(
          { ok: false, code: 'PUBLIC_USER_UPDATE_FAILED', message: updateUserError.message },
          { status: 400 }
        )
      );
    }

    return respond(NextResponse.json({ ok: true }));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unexpected error.';
    return respond(NextResponse.json({ ok: false, code: 'UNEXPECTED_ERROR', message }, { status: 500 }));
  }
}
