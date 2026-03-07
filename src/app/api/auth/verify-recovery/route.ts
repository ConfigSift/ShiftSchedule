import { NextRequest, NextResponse } from 'next/server';
import { applySupabaseCookies, createSupabaseRouteClient } from '@/lib/supabase/route';

type VerifyRecoveryPayload = {
  token_hash?: string;
  type?: string;
  next?: string;
};

const DEFAULT_REDIRECT = '/reset-password';

function toSafeRedirectPath(candidate?: string | null) {
  if (!candidate || !candidate.startsWith('/') || candidate.startsWith('//')) {
    return DEFAULT_REDIRECT;
  }
  if (/http/i.test(candidate)) {
    return DEFAULT_REDIRECT;
  }
  return candidate;
}

export async function POST(request: NextRequest) {
  let payload: VerifyRecoveryPayload;

  try {
    payload = (await request.json()) as VerifyRecoveryPayload;
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body.' },
      { status: 400 },
    );
  }

  const tokenHash = payload.token_hash?.trim();
  const redirectPath = toSafeRedirectPath(payload.next);

  if (!tokenHash) {
    return NextResponse.json(
      { error: 'missing_token_hash' },
      { status: 400 },
    );
  }

  try {
    const { supabase, response } = createSupabaseRouteClient(request);
    const { error } = await supabase.auth.verifyOtp({
      type: 'recovery',
      token_hash: tokenHash,
    });

    if (error) {
      return applySupabaseCookies(
        NextResponse.json(
          { error: 'otp_invalid_or_expired' },
          { status: 400 },
        ),
        response,
      );
    }

    response.cookies.set('cs_recovery_required', '1', {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });

    return applySupabaseCookies(
      NextResponse.json({ redirect: redirectPath }),
      response,
    );
  } catch {
    return NextResponse.json(
      { error: 'otp_invalid_or_expired' },
      { status: 400 },
    );
  }
}
