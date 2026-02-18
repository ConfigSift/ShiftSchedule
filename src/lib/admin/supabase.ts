import { supabaseAdmin } from '@/lib/supabase/admin';

/**
 * Returns the Supabase admin client (service role).
 *
 * Re-exports the existing singleton so admin dashboard code has a single,
 * explicit import path while keeping the underlying client the same.
 */
export function getAdminSupabase() {
  return supabaseAdmin;
}
