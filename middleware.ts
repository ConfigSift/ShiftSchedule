import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { getSupabaseEnv } from '@/lib/supabase/env';

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

  await supabase.auth.getUser();
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
