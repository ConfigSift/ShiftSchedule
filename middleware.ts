import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { getSupabaseEnv } from '@/lib/supabase/env';
import type { User } from '@supabase/supabase-js';
import { isManagerRole } from '@/utils/role';

/** Routes that skip the subscription billing gate entirely */
const BILLING_EXEMPT_PREFIXES = [
  '/subscribe',
  '/api/billing/',
  '/api/auth/',
  '/api/orgs/',
  '/api/organizations/',
  '/restaurants',
  '/manager',
  '/billing',
  '/login',
  '/signup',
  '/setup',
  '/pricing',
  '/start',
  '/onboarding',
  '/demo',
];

const BILLING_EXEMPT_EXACT = ['/', '/restaurants', '/start', '/onboarding'];

function isBillingExempt(pathname: string): boolean {
  if (BILLING_EXEMPT_EXACT.includes(pathname)) return true;
  return BILLING_EXEMPT_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export async function middleware(req: NextRequest) {
  const { supabaseUrl, supabaseAnonKey, isValid } = getSupabaseEnv();
  if (!isValid) {
    return NextResponse.next();
  }

  const response = NextResponse.next();
  const isDev = process.env.NODE_ENV !== 'production';
  const { pathname } = req.nextUrl;
  const debugAuthRoute = pathname === '/dashboard'
    || pathname.startsWith('/dashboard/')
    || pathname === '/restaurants'
    || pathname.startsWith('/restaurants/');
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

  if (isDev && debugAuthRoute) {
    // eslint-disable-next-line no-console
    console.debug('[middleware] auth-check', {
      pathname,
      hasUser: Boolean(user),
      userId: user?.id ?? null,
      billingCookie: req.cookies.get('sf_billing_ok')?.value ?? null,
    });
  }

  const redirectTo = (destination: string) => {
    if (isDev && debugAuthRoute) {
      // eslint-disable-next-line no-console
      console.debug('[middleware] redirect', {
        from: pathname,
        to: destination,
        hasUser: Boolean(user),
        userId: user?.id ?? null,
      });
    }
    const url = new URL(destination, req.url);
    response.headers.set('location', url.toString());
    const redirect = NextResponse.redirect(url, 302);

// copy cookies from the existing response (important for Supabase auth cookies)
response.cookies.getAll().forEach((c) => redirect.cookies.set(c));

return redirect;
  };

  // --- Manager route protection (existing) ---
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

  // --- Billing gate (lightweight, cookie-based) ---
  const billingEnabled = process.env.NEXT_PUBLIC_BILLING_ENABLED === 'true';

  if (billingEnabled && user && !isBillingExempt(pathname)) {
    const billingCookie = req.cookies.get('sf_billing_ok')?.value;

    if (!billingCookie) {
      // No billing cookie — redirect to /subscribe as safety net.
      // The client-side SubscriptionGate does the authoritative check;
      // this redirect catches direct URL access without a valid cookie.
      return redirectTo('/subscribe');
    }

    // If subscription is past_due, set a response header the UI can read
    if (billingCookie === 'past_due') {
      response.headers.set('x-sf-billing-warning', 'past_due');
    }
  }

  return response;
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/restaurants/:path*',
    '/manager/:path*',
    '/staff/:path*',
    '/time-off/:path*',
    '/debug/:path*',
    '/api/:path*',
    '/schedule/:path*',
    '/blocked-days/:path*',
    '/business-hours/:path*',
    '/chat/:path*',
    '/reports/:path*',
    '/review-requests/:path*',
    '/shift-exchange/:path*',
    '/profile/:path*',
  ],
};
