const PLACEHOLDER_TOKENS = [
  'YOUR_PROJECT_REF',
  'YOUR_PROJECT_URL',
  'YOUR_SUPABASE_URL',
  'YOUR_SUPABASE_ANON_KEY',
  'YOUR_ANON_KEY',
  'YOUR_SERVICE_ROLE_KEY',
  'YOUR_PROJECT_ID',
];

const PLACEHOLDER_FRAGMENTS = [
  'your_project_ref',
  'your-project-ref',
  'your_supabase_url',
  'your_supabase_anon_key',
  'your_anon_key',
  'your-service-role-key',
  'your_project_id',
];

const SUPABASE_URL_REGEX = /^https:\/\/[a-z0-9-]+\.supabase\.co$/i;
const SUPABASE_JWT_REGEX = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

export function normalizeEnvValue(value?: string): string {
  if (!value) return '';
  let normalized = value.replace(/\r?\n/g, '').trim();
  if (
    (normalized.startsWith('"') && normalized.endsWith('"')) ||
    (normalized.startsWith("'") && normalized.endsWith("'"))
  ) {
    normalized = normalized.slice(1, -1).trim();
  }
  return normalized;
}

export function isPlaceholderEnv(value: string): boolean {
  const trimmed = value.trim();
  const upper = trimmed.toUpperCase();
  if (PLACEHOLDER_TOKENS.some((token) => upper.includes(token))) {
    return true;
  }
  const lower = trimmed.toLowerCase();
  return PLACEHOLDER_FRAGMENTS.some((fragment) => lower.includes(fragment));
}

export function getSupabaseEnv() {
  const supabaseUrl = normalizeEnvValue(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const supabaseAnonKey = normalizeEnvValue(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  const urlValid =
    Boolean(supabaseUrl) &&
    SUPABASE_URL_REGEX.test(supabaseUrl) &&
    !isPlaceholderEnv(supabaseUrl);
  const anonKeyValid =
    Boolean(supabaseAnonKey) &&
    SUPABASE_JWT_REGEX.test(supabaseAnonKey) &&
    !isPlaceholderEnv(supabaseAnonKey);

  return {
    supabaseUrl,
    supabaseAnonKey,
    urlValid,
    anonKeyValid,
    isValid: urlValid && anonKeyValid,
  };
}

export function formatSupabaseEnvError() {
  const { supabaseUrl, supabaseAnonKey, urlValid, anonKeyValid } = getSupabaseEnv();
  const keyPreview = supabaseAnonKey ? `${supabaseAnonKey.slice(0, 12)}...` : '(missing)';
  const urlPreview = supabaseUrl || '(missing)';

  const failures = [
    urlValid ? null : 'URL invalid',
    anonKeyValid ? null : 'ANON KEY invalid',
  ].filter(Boolean);

  return `Invalid Supabase env vars: ${failures.join(', ')}. URL=${urlPreview} KEY=${keyPreview}`;
}
