import { createClient } from '@supabase/supabase-js';
import { formatSupabaseEnvError, getSupabaseEnv, isPlaceholderEnv, normalizeEnvValue } from './env';

const serviceRoleKey = normalizeEnvValue(process.env.SUPABASE_SERVICE_ROLE_KEY);
const { supabaseUrl, isValid } = getSupabaseEnv();

if (!supabaseUrl || !serviceRoleKey || !isValid || isPlaceholderEnv(serviceRoleKey)) {
  throw new Error(formatSupabaseEnvError());
}

export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
