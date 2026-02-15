const APP_BASE = 'https://app.crewshyft.com';
const LOGIN_BASE = 'https://login.crewshyft.com';

function normalizeHost(value: string): string {
  return value.trim().toLowerCase().split(':')[0] ?? '';
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

export function getAppBase(originOrHost: string): string {
  const host = getHost(originOrHost);
  if (getIsLocalhost(host)) {
    return toOrigin(originOrHost) || APP_BASE;
  }
  return APP_BASE;
}

export function getLoginBase(originOrHost: string): string {
  const host = getHost(originOrHost);
  if (getIsLocalhost(host)) {
    return toOrigin(originOrHost) || LOGIN_BASE;
  }
  return LOGIN_BASE;
}
