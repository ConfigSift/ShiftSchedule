import { NextRequest, NextResponse } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { applySupabaseCookies, createSupabaseRouteClient } from '@/lib/supabase/route';

const OTP_TYPES = new Set<EmailOtpType>([
  'signup',
  'recovery',
  'invite',
  'email',
  'email_change',
  'magiclink',
]);

const VERIFIED_NOTICE_PATH = '/login?notice=email-verified';
const FAILED_NOTICE_PATH = '/login?notice=verification-failed';

function toSafeRedirectPath(candidate: string | null, fallback: string) {
  if (!candidate || !candidate.startsWith('/') || candidate.startsWith('//')) return fallback;
  // `next` must remain an internal path to avoid open redirects.
  if (/http/i.test(candidate)) return fallback;
  return candidate;
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const providerError =
    requestUrl.searchParams.get('error') ??
    requestUrl.searchParams.get('error_code');
  const code = requestUrl.searchParams.get('code');
  const tokenHash = requestUrl.searchParams.get('token_hash');
  const type = requestUrl.searchParams.get('type');
  const next = requestUrl.searchParams.get('next');
  let redirectPath = toSafeRedirectPath(next, VERIFIED_NOTICE_PATH);

  const { supabase, response } = createSupabaseRouteClient(request);

  if (providerError) {
    redirectPath = FAILED_NOTICE_PATH;
  } else if (code) {
    try {
      // Handles Supabase links that return with OAuth-style "code" callbacks.
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        redirectPath = FAILED_NOTICE_PATH;
      }
    } catch {
      redirectPath = FAILED_NOTICE_PATH;
    }
  } else if (tokenHash && type) {
    if (!OTP_TYPES.has(type as EmailOtpType)) {
      redirectPath = FAILED_NOTICE_PATH;
    } else {
      try {
        // Handles links using token_hash + type (signup / recovery / magiclink).
        const { error } = await supabase.auth.verifyOtp({
          type: type as EmailOtpType,
          token_hash: tokenHash,
        });
        if (error) {
          redirectPath = FAILED_NOTICE_PATH;
        }
      } catch {
        redirectPath = FAILED_NOTICE_PATH;
      }
    }
  } else {
    redirectPath = FAILED_NOTICE_PATH;
  }

  const redirect = NextResponse.redirect(new URL(redirectPath, request.url));
  return applySupabaseCookies(redirect, response);
}
