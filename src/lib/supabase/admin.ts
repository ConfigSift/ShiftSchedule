import { createClient } from '@supabase/supabase-js';
import { isPlaceholderEnv } from './env';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

if (
  !supabaseUrl ||
  !serviceRoleKey ||
  isPlaceholderEnv(supabaseUrl) ||
  isPlaceholderEnv(serviceRoleKey)
) {
  throw new Error(
    'Invalid Supabase env vars: set real NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY values.'
  );
}

export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
