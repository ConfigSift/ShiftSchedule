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

export function isPlaceholderEnv(value: string): boolean {
  const trimmed = value.trim();
  const upper = trimmed.toUpperCase();
  if (PLACEHOLDER_TOKENS.some((token) => upper.includes(token))) {
    return true;
  }
  const lower = trimmed.toLowerCase();
  return PLACEHOLDER_FRAGMENTS.some((fragment) => lower.includes(fragment));
}
