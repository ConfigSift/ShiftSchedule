import { createBrowserClient } from '@supabase/ssr';
import { formatSupabaseEnvError, getSupabaseEnv } from './env';

let browserClient: ReturnType<typeof createBrowserClient> | null = null;

export function createSupabaseBrowserClient() {
  const { supabaseUrl, supabaseAnonKey, isValid } = getSupabaseEnv();

  if (!isValid) {
    throw new Error(formatSupabaseEnvError());
  }

  if (!browserClient) {
    browserClient = createBrowserClient(supabaseUrl, supabaseAnonKey);
  }

  return browserClient;
}
