import { NextRequest, NextResponse } from 'next/server';
import { applySupabaseCookies, createSupabaseRouteClient } from '@/lib/supabase/route';
import { jsonError } from '@/lib/apiResponses';
import { splitFullName } from '@/utils/userMapper';

type UpdatePayload = {
  fullName: string;
  phone?: string | null;
  email?: string | null;
};

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(request: NextRequest) {
  const rawPayload = (await request.json()) as Record<string, unknown>;
  const allowedFields = new Set(['fullName', 'phone', 'email']);
  const forbiddenFields = Object.keys(rawPayload).filter((key) => !allowedFields.has(key));

  if (forbiddenFields.length > 0) {
    return NextResponse.json(
      { error: 'Only name, phone, and email can be updated.', forbiddenFields },
      { status: 400 }
    );
  }

  const payload = rawPayload as UpdatePayload;

  if (!payload.fullName || !payload.fullName.trim()) {
    return NextResponse.json({ error: 'Full name is required.' }, { status: 400 });
  }
  if (payload.email !== undefined && payload.email !== null && !payload.email.trim()) {
    return NextResponse.json({ error: 'Email is required.' }, { status: 400 });
  }

  const { supabase, response } = createSupabaseRouteClient(request);
  const { data: authData } = await supabase.auth.getUser();
  const authUserId = authData.user?.id;

  if (!authUserId) {
    return applySupabaseCookies(jsonError('Unauthorized.', 401), response);
  }

  // Only update public.users table (NOT Supabase Auth email)
  const updatePayload = {
    full_name: payload.fullName.trim(),
    phone: payload.phone ?? '',
    ...(payload.email ? { email: payload.email.trim() } : {}),
  };

  const result = await supabase
    .from('users')
    .update(updatePayload)
    .eq('auth_user_id', authUserId);

  if (result.error) {
    const errorMsg = result.error.message?.toLowerCase() ?? '';

    // Handle unique constraint violation for email
    if (errorMsg.includes('users_email_key') || errorMsg.includes('duplicate') && errorMsg.includes('email')) {
      return applySupabaseCookies(
        NextResponse.json({
          error: 'This email address is already in use by another account.',
          code: 'EMAIL_TAKEN',
        }, { status: 400 }),
        response
      );
    }

    // Handle legacy schema without full_name column
    if (errorMsg.includes('full_name')) {
      const { firstName, lastName } = splitFullName(payload.fullName);
      const fallbackResult = await supabase
        .from('users')
        .update({
          first_name: firstName,
          last_name: lastName,
          phone: payload.phone ?? '',
          ...(payload.email ? { email: payload.email.trim() } : {}),
        })
        .eq('auth_user_id', authUserId);
      if (fallbackResult.error) {
        const fallbackMsg = fallbackResult.error.message?.toLowerCase() ?? '';
        if (fallbackMsg.includes('users_email_key') || fallbackMsg.includes('duplicate') && fallbackMsg.includes('email')) {
          return applySupabaseCookies(
            NextResponse.json({
              error: 'This email address is already in use by another account.',
              code: 'EMAIL_TAKEN',
            }, { status: 400 }),
            response
          );
        }
        return applySupabaseCookies(
          NextResponse.json({ error: fallbackResult.error.message }, { status: 400 }),
          response
        );
      }
    } else {
      return applySupabaseCookies(
        NextResponse.json({ error: result.error.message }, { status: 400 }),
        response
      );
    }
  }

  return applySupabaseCookies(NextResponse.json({ success: true }), response);
}
