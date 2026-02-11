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
  const authHeader = req.headers.get('authorization') ?? '';
  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  const bearerToken = bearerMatch?.[1]?.trim() || null;

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    ...(bearerToken
      ? {
          global: {
            headers: {
              Authorization: `Bearer ${bearerToken}`,
            },
          },
        }
      : {}),
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

  if (bearerToken) {
    const originalGetUser = supabase.auth.getUser.bind(supabase.auth);
    supabase.auth.getUser = ((jwt?: string) => originalGetUser(jwt ?? bearerToken)) as typeof supabase.auth.getUser;
  }

  return { supabase, response };
}

export function applySupabaseCookies(target: NextResponse, source: NextResponse) {
  source.cookies.getAll().forEach((cookie) => {
    target.cookies.set(cookie.name, cookie.value, cookie);
  });
  return target;
}
