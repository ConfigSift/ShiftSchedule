const APP_SUBDOMAIN_PREFIX = 'app.';

function normalizeHost(value: string | null | undefined) {
  return String(value ?? '').split(':')[0].trim().toLowerCase();
}

export function isAppSubdomainHost(host?: string | null) {
  return normalizeHost(host).startsWith(APP_SUBDOMAIN_PREFIX);
}

export function getAppHomeHref(host?: string | null) {
  const resolvedHost = host ?? (typeof window !== 'undefined' ? window.location.host : '');
  return isAppSubdomainHost(resolvedHost) ? '/' : '/dashboard';
}
