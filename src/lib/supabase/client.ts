import { createSupabaseBrowserClient } from './browser';

export function getSupabaseClient() {
  return createSupabaseBrowserClient();
}

export const supabase = new Proxy({} as ReturnType<typeof getSupabaseClient>, {
  get(_target, prop) {
    const client = getSupabaseClient();
    return client[prop as keyof typeof client];
  },
});
