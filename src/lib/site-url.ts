function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '');
}

export function getSiteUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!configured) return 'http://localhost:3000';
  return trimTrailingSlash(configured);
}

export function getAuthCallbackUrl() {
  return `${getSiteUrl()}/auth/callback`;
}
