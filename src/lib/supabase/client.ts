import { createClient } from '@supabase/supabase-js';
import { isPlaceholderEnv } from './env';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

if (!supabaseUrl || !supabaseAnonKey || isPlaceholderEnv(supabaseUrl) || isPlaceholderEnv(supabaseAnonKey)) {
  throw new Error(
    'Invalid Supabase env vars: set real NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY values.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
