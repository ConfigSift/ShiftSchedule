import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { getSupabaseEnv } from '@/lib/supabase/env';
import type { User } from '@supabase/supabase-js';
import { isManagerRole } from '@/utils/role';

export async function middleware(req: NextRequest) {
  const { supabaseUrl, supabaseAnonKey, isValid } = getSupabaseEnv();
  if (!isValid) {
    return NextResponse.next();
  }

  const response = NextResponse.next();
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(cookies) {
        cookies.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });
  let user: User | null = null;

  try {
    const { data } = await supabase.auth.getUser();
    user = data.user ?? null;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      message.includes('Refresh Token Not Found')
      || message.includes('Invalid Refresh Token')
    ) {
      // Ignore missing/invalid refresh tokens and proceed; user will naturally hit /login.
    } else {
      throw error;
    }
  }

  const redirectTo = (destination: string) => {
    const url = new URL(destination, req.url);
    response.headers.set('location', url.toString());
    const redirect = NextResponse.redirect(url, 302);

// copy cookies from the existing response (important for Supabase auth cookies)
response.cookies.getAll().forEach((c) => redirect.cookies.set(c));

return redirect;
};

  const { pathname } = req.nextUrl;
  if (pathname.startsWith('/manager')) {
    if (!user) {
      return redirectTo('/login');
    }

    try {
      const { data: profile } = await supabase
        .from('users')
        .select('role')
        .eq('auth_user_id', user.id)
        .maybeSingle();

      const roleValue = profile?.role ?? user.user_metadata?.role ?? undefined;
      if (!isManagerRole(roleValue)) {
        return redirectTo('/dashboard');
      }
    } catch {
      return redirectTo('/dashboard');
    }
  }
  return response;
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/manager/:path*',
    '/staff/:path*',
    '/time-off/:path*',
    '/debug/:path*',
    '/api/:path*',
  ],
};

