const APP_BASE = 'https://app.crewshyft.com';
const LOGIN_BASE = 'https://login.crewshyft.com';
const MARKETING_BASE = 'https://crewshyft.com';

function normalizeHost(value: string): string {
  return value.trim().toLowerCase().split(':')[0] ?? '';
}

function normalizeAbsoluteUrl(value: string | undefined): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  try {
    const parsed = /^https?:\/\//i.test(raw) ? new URL(raw) : new URL(`https://${raw}`);
    return parsed.origin;
  } catch {
    return '';
  }
}

function toOrigin(originOrHost: string): string {
  const raw = String(originOrHost ?? '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) {
    try {
      return new URL(raw).origin;
    } catch {
      return '';
    }
  }
  const host = normalizeHost(raw);
  if (!host) return '';
  const protocol = host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https';
  return `${protocol}://${host}`;
}

function getHost(originOrHost: string): string {
  const raw = String(originOrHost ?? '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) {
    try {
      return normalizeHost(new URL(raw).host);
    } catch {
      return '';
    }
  }
  return normalizeHost(raw);
}

export function getIsLocalhost(host: string): boolean {
  const normalized = normalizeHost(host);
  return normalized === 'localhost' || normalized.startsWith('localhost') || normalized.startsWith('127.0.0.1');
}

function isPreviewHost(host: string): boolean {
  return host.endsWith('.vercel.app');
}

function getHostDerivedBases(originOrHost: string): { appBaseUrl: string; loginBaseUrl: string } | null {
  const host = getHost(originOrHost);
  if (!host) return null;

  if (getIsLocalhost(host) || isPreviewHost(host)) {
    const origin = toOrigin(originOrHost);
    if (!origin) return null;
    return { appBaseUrl: origin, loginBaseUrl: origin };
  }

  if (host === 'app.crewshyft.com') {
    return { appBaseUrl: 'https://app.crewshyft.com', loginBaseUrl: 'https://login.crewshyft.com' };
  }
  if (host === 'login.crewshyft.com') {
    return { appBaseUrl: 'https://app.crewshyft.com', loginBaseUrl: 'https://login.crewshyft.com' };
  }
  if (host === 'crewshyft.com' || host === 'www.crewshyft.com') {
    return { appBaseUrl: 'https://app.crewshyft.com', loginBaseUrl: 'https://login.crewshyft.com' };
  }

  const origin = toOrigin(originOrHost);
  if (!origin) return null;
  return { appBaseUrl: origin, loginBaseUrl: origin };
}

export function getBaseUrls(originOrHost?: string): { appBaseUrl: string; loginBaseUrl: string } {
  const configuredAppBase = normalizeAbsoluteUrl(process.env.NEXT_PUBLIC_APP_URL);
  const configuredLoginBase = normalizeAbsoluteUrl(process.env.NEXT_PUBLIC_LOGIN_URL);
  const hostDerived = getHostDerivedBases(String(originOrHost ?? ''));

  const appBaseUrl = configuredAppBase || hostDerived?.appBaseUrl || APP_BASE;
  const loginBaseUrl = configuredLoginBase || hostDerived?.loginBaseUrl || LOGIN_BASE;
  return { appBaseUrl, loginBaseUrl };
}

export function getAppBase(originOrHost: string): string {
  return getBaseUrls(originOrHost).appBaseUrl;
}

export function getLoginBase(originOrHost: string): string {
  return getBaseUrls(originOrHost).loginBaseUrl;
}

export function getMarketingBase(): string {
  return normalizeAbsoluteUrl(process.env.NEXT_PUBLIC_SITE_URL) || MARKETING_BASE;
}
