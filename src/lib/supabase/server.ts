import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { formatSupabaseEnvError, getSupabaseEnv } from './env';

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const { supabaseUrl, supabaseAnonKey, isValid } = getSupabaseEnv();

  if (!isValid) {
    throw new Error(formatSupabaseEnvError());
  }

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options);
        });
      },
    },
  });
}
