import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { formatSupabaseEnvError, getSupabaseEnv } from './env';

type SupabaseRouteClient = {
  supabase: ReturnType<typeof createServerClient>;
  response: NextResponse;
};

export function createSupabaseRouteClient(req: NextRequest): SupabaseRouteClient {
  const { supabaseUrl, supabaseAnonKey, isValid } = getSupabaseEnv();

  if (!isValid) {
    throw new Error(formatSupabaseEnvError());
  }

  const response = NextResponse.next();

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  return { supabase, response };
}

export function applySupabaseCookies(target: NextResponse, source: NextResponse) {
  source.cookies.getAll().forEach((cookie) => {
    target.cookies.set(cookie.name, cookie.value, cookie);
  });
  return target;
}
