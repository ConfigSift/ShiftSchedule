import { createClient } from '@supabase/supabase-js';
import { formatSupabaseEnvError, getSupabaseEnv } from './env';

let supabaseClient: ReturnType<typeof createClient> | null = null;

export function getSupabaseClient() {
  const { supabaseUrl, supabaseAnonKey, isValid } = getSupabaseEnv();
  if (!isValid) {
    throw new Error(formatSupabaseEnvError());
  }

  if (!supabaseClient) {
    supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
  }

  return supabaseClient;
}

export const supabase = new Proxy({} as ReturnType<typeof createClient>, {
  get(_target, prop) {
    const client = getSupabaseClient();
    return client[prop as keyof typeof client];
  },
});
