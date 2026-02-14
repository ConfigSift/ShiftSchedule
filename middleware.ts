import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

const ROOT_DOMAIN = 'crewshyft.com';
const WWW_DOMAIN = 'www.crewshyft.com';
const LOGIN_SUBDOMAIN = 'login.crewshyft.com';
const APP_SUBDOMAIN = 'app.crewshyft.com';
const NO_ORG_REDIRECT_PATH = '/restaurants';

const MARKETING_ROUTES = ['/', '/pricing', '/features', '/privacy', '/terms'];
const LOGIN_ROUTE_PREFIXES = ['/login', '/signup', '/start', '/onboarding', '/auth', '/reset-passcode'];
const APP_ROUTE_PREFIXES = [
  '/dashboard',
  '/restaurants',
  '/staff',
  '/reports',
  '/chat',
  '/blocked-days',
  '/business-hours',
  '/schedule',
  '/profile',
  '/review-requests',
  '/time-off',
  '/billing',
  '/manager',
  '/setup',
  '/shift-exchange',
  '/subscribe',
];

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
const SUPABASE_URL_REGEX = /^https:\/\/[a-z0-9-]+\.supabase\.co$/i;
const SUPABASE_JWT_REGEX = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

function normalizeHost(rawHost: string | null) {
  return String(rawHost ?? '').split(':')[0].trim().toLowerCase();
}

function normalizeEnvValue(value?: string): string {
  if (!value) return '';
  let normalized = value.replace(/\r?\n/g, '').trim();
  if (
    (normalized.startsWith('"') && normalized.endsWith('"'))
    || (normalized.startsWith("'") && normalized.endsWith("'"))
  ) {
    normalized = normalized.slice(1, -1).trim();
  }
  return normalized;
}

function getSupabaseEnvEdgeSafe() {
  const supabaseUrl = normalizeEnvValue(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const supabaseAnonKey = normalizeEnvValue(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const isValid =
    Boolean(supabaseUrl)
    && Boolean(supabaseAnonKey)
    && SUPABASE_URL_REGEX.test(supabaseUrl)
    && SUPABASE_JWT_REGEX.test(supabaseAnonKey);
  return { supabaseUrl, supabaseAnonKey, isValid };
}

function isManagerRole(value: unknown): boolean {
  const role = String(value ?? '').trim().toUpperCase();
  return role === 'ADMIN' || role === 'MANAGER';
}

function pathMatchesPrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function isMarketingRoute(pathname: string) {
  return MARKETING_ROUTES.some((route) => pathMatchesPrefix(pathname, route));
}

function isLoginRoute(pathname: string) {
  return LOGIN_ROUTE_PREFIXES.some((route) => pathMatchesPrefix(pathname, route));
}

function isAppRoute(pathname: string) {
  return APP_ROUTE_PREFIXES.some((route) => pathMatchesPrefix(pathname, route));
}

function isBillingExempt(pathname: string): boolean {
  if (BILLING_EXEMPT_EXACT.includes(pathname)) return true;
  return BILLING_EXEMPT_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function isNonPageAsset(pathname: string) {
  return (
    pathname.startsWith('/_next/')
    || pathname.startsWith('/api/')
    || pathname.startsWith('/favicon')
    || pathname.startsWith('/manifest')
    || pathname === '/robots.txt'
    || pathname === '/sitemap.xml'
    || /\.[A-Za-z0-9]+$/.test(pathname)
  );
}

function isLocalOrPreviewHost(host: string) {
  return (
    host.includes('localhost')
    || host.startsWith('127.0.0.1')
    || host.endsWith('.vercel.app')
  );
}

function isMarketingHost(host: string) {
  return host === ROOT_DOMAIN || host === WWW_DOMAIN;
}

function mapToLoginSubdomainPath(pathname: string) {
  if (pathMatchesPrefix(pathname, '/login')) {
    return '/';
  }
  return pathname;
}

function mapToAppSubdomainPath(pathname: string) {
  if (pathMatchesPrefix(pathname, '/dashboard')) {
    return '/';
  }
  return pathname;
}

function buildHostRedirectUrl(req: NextRequest, targetHost: string, targetPathname: string) {
  const url = req.nextUrl.clone();
  url.protocol = 'https';
  url.host = targetHost;
  url.pathname = targetPathname;
  return url;
}

function cloneSupabaseCookies(source: NextResponse, target: NextResponse) {
  source.cookies.getAll().forEach((cookie) => {
    target.cookies.set(cookie);
  });
}

function buildLoginRedirectUrl(req: NextRequest, localOrPreviewHost: boolean, nextPath: string) {
  const loginUrl = localOrPreviewHost
    ? new URL('/login', req.url)
    : buildHostRedirectUrl(req, LOGIN_SUBDOMAIN, '/');
  if (nextPath) {
    loginUrl.searchParams.set('next', nextPath);
  }
  return loginUrl;
}

function shouldRedirectToLoginSubdomain(host: string, pathname: string) {
  return isMarketingHost(host) && isLoginRoute(pathname);
}

function shouldRedirectToAppSubdomain(host: string, pathname: string) {
  return (isMarketingHost(host) && isAppRoute(pathname)) || (host === LOGIN_SUBDOMAIN && isAppRoute(pathname));
}

function shouldRedirectToLoginFromApp(host: string, pathname: string) {
  return host === APP_SUBDOMAIN && isLoginRoute(pathname);
}

async function runMiddleware(req: NextRequest) {
  const host = normalizeHost(req.headers.get('host'));
  const localOrPreviewHost = isLocalOrPreviewHost(host);
  const requestUrl = req.nextUrl.clone();
  const originalPathname = requestUrl.pathname;

  if (isNonPageAsset(originalPathname)) {
    return NextResponse.next();
  }

  if (!localOrPreviewHost) {
    if (shouldRedirectToLoginSubdomain(host, originalPathname)) {
      const targetPath = mapToLoginSubdomainPath(originalPathname);
      return NextResponse.redirect(buildHostRedirectUrl(req, LOGIN_SUBDOMAIN, targetPath), 302);
    }

    if (shouldRedirectToAppSubdomain(host, originalPathname)) {
      const targetPath = mapToAppSubdomainPath(originalPathname);
      return NextResponse.redirect(buildHostRedirectUrl(req, APP_SUBDOMAIN, targetPath), 302);
    }

    if (shouldRedirectToLoginFromApp(host, originalPathname)) {
      const targetPath = mapToLoginSubdomainPath(originalPathname);
      return NextResponse.redirect(buildHostRedirectUrl(req, LOGIN_SUBDOMAIN, targetPath), 302);
    }
  }

  let response = NextResponse.next();
  let routeForGuards = originalPathname;

  if (!localOrPreviewHost && host === LOGIN_SUBDOMAIN && originalPathname === '/') {
    const rewriteUrl = req.nextUrl.clone();
    rewriteUrl.pathname = '/login';
    response = NextResponse.rewrite(rewriteUrl);
    routeForGuards = '/login';
  }

  if (!localOrPreviewHost && host === APP_SUBDOMAIN && (originalPathname === '/' || originalPathname === '/schedule')) {
    routeForGuards = '/dashboard';
  }

  if (!isAppRoute(routeForGuards)) {
    if (!localOrPreviewHost && host === LOGIN_SUBDOMAIN && isMarketingRoute(originalPathname)) {
      const marketingUrl = buildHostRedirectUrl(req, ROOT_DOMAIN, originalPathname);
      return NextResponse.redirect(marketingUrl, 302);
    }
    return response;
  }

  const { supabaseUrl, supabaseAnonKey, isValid } = getSupabaseEnvEdgeSafe();
  if (!isValid) {
    return response;
  }

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

  let user: { id: string; user_metadata?: Record<string, unknown> } | null = null;

  try {
    const { data } = await supabase.auth.getUser();
    user = data.user ?? null;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      message.includes('Refresh Token Not Found')
      || message.includes('Invalid Refresh Token')
    ) {
      user = null;
    } else {
      throw error;
    }
  }

  const redirectTo = (destination: string | URL, status = 302) => {
    const redirectUrl =
      destination instanceof URL
        ? destination
        : destination.startsWith('http')
          ? new URL(destination)
          : new URL(destination, req.url);
    const redirect = NextResponse.redirect(redirectUrl, status);
    cloneSupabaseCookies(response, redirect);
    return redirect;
  };

  if (!user) {
    const nextPath = `${originalPathname}${requestUrl.search}`;
    return redirectTo(buildLoginRedirectUrl(req, localOrPreviewHost, nextPath));
  }

  const onRestaurantsRoute = pathMatchesPrefix(routeForGuards, '/restaurants');
  const onSetupRoute = pathMatchesPrefix(routeForGuards, '/setup');
  if (!onRestaurantsRoute && !onSetupRoute) {
    const { count, error: membershipCountError } = await supabase
      .from('organization_memberships')
      .select('organization_id', { count: 'exact', head: true })
      .eq('auth_user_id', user.id);

    if (!membershipCountError && (count ?? 0) === 0) {
      return redirectTo(NO_ORG_REDIRECT_PATH);
    }
  }

  if (pathMatchesPrefix(routeForGuards, '/manager')) {
    try {
      const { data: profile } = await supabase
        .from('users')
        .select('role')
        .eq('auth_user_id', user.id)
        .maybeSingle();

      const roleValue = profile?.role ?? user.user_metadata?.role ?? undefined;
      if (!isManagerRole(roleValue)) {
        return redirectTo('/dashboard?notice=forbidden');
      }
    } catch {
      return redirectTo('/dashboard?notice=forbidden');
    }
  }

  const billingEnabled = process.env.NEXT_PUBLIC_BILLING_ENABLED === 'true';
  if (billingEnabled && !isBillingExempt(routeForGuards)) {
    const billingCookie = req.cookies.get('sf_billing_ok')?.value;

    if (!billingCookie) {
      return redirectTo('/subscribe');
    }

    if (billingCookie === 'past_due') {
      response.headers.set('x-sf-billing-warning', 'past_due');
    }
  }

  return response;
}

export async function middleware(req: NextRequest) {
  try {
    return await runMiddleware(req);
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    const stack = err.stack ? ` | ${err.stack}` : '';
    console.error(`[middleware] fail-open: ${err.message}${stack}`);
    return NextResponse.next();
  }
}

export const config = {
  matcher: [
    '/((?!api/|_next/static|_next/image|_next/data|favicon.ico|robots.txt|sitemap.xml|manifest|manifest.webmanifest|manifest.json|.*\\..*).*)',
  ],
};
