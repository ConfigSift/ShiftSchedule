import { getAdminSupabase } from '@/lib/admin/supabase';

type AuthUserRow = {
  id: string;
  email: string | null;
};

const MAX_FALLBACK_PAGES = 50;
const FALLBACK_PAGE_SIZE = 1000;

function toUniqueIds(ids: string[]): string[] {
  return [...new Set(ids.map((id) => String(id).trim()).filter(Boolean))];
}

function toAuthUserMap(rows: AuthUserRow[] | null | undefined): Map<string, string | null> {
  const map = new Map<string, string | null>();
  for (const row of rows ?? []) {
    map.set(String(row.id), row.email ? String(row.email) : null);
  }
  return map;
}

async function fetchAuthUsersViaSchema(ids: string[]): Promise<Map<string, string | null> | null> {
  const db = getAdminSupabase() as unknown as {
    schema: (schema: string) => {
      from: (table: string) => {
        select: (columns: string) => {
          in: (column: string, values: string[]) => Promise<{ data: AuthUserRow[] | null; error: { message?: string } | null }>;
        };
      };
    };
  };

  try {
    const { data, error } = await db
      .schema('auth')
      .from('users')
      .select('id,email')
      .in('id', ids);

    if (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[admin/auth-users] auth.users query failed, using fallback', error.message);
      }
      return null;
    }

    return toAuthUserMap(data);
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[admin/auth-users] auth.users query threw, using fallback', error);
    }
    return null;
  }
}

async function fetchAuthUsersViaAdminApi(ids: string[]): Promise<Map<string, string | null>> {
  const db = getAdminSupabase();
  const targetIds = new Set(ids);
  const map = new Map<string, string | null>();

  for (let page = 1; page <= MAX_FALLBACK_PAGES; page += 1) {
    const { data, error } = await db.auth.admin.listUsers({
      page,
      perPage: FALLBACK_PAGE_SIZE,
    });

    if (error) {
      throw new Error(error.message || 'Unable to list auth users.');
    }

    const users = data?.users ?? [];
    for (const user of users) {
      if (targetIds.has(user.id)) {
        map.set(user.id, user.email ?? null);
      }
    }

    if (map.size === targetIds.size || users.length < FALLBACK_PAGE_SIZE) {
      break;
    }
  }

  return map;
}

/**
 * Server-only helper. Requires service role via getAdminSupabase().
 */
export async function getAuthUsersByIds(ids: string[]): Promise<Map<string, string | null>> {
  const uniqueIds = toUniqueIds(ids);
  if (uniqueIds.length === 0) return new Map();

  const direct = await fetchAuthUsersViaSchema(uniqueIds);
  if (direct) return direct;

  return fetchAuthUsersViaAdminApi(uniqueIds);
}

export async function getAuthUserById(authUserId: string): Promise<{ exists: boolean; email: string | null }> {
  const id = String(authUserId ?? '').trim();
  if (!id) return { exists: false, email: null };
  const users = await getAuthUsersByIds([id]);
  return {
    exists: users.has(id),
    email: users.get(id) ?? null,
  };
}
