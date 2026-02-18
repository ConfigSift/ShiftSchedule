import { getAdminSupabase } from '@/lib/admin/supabase';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SearchResultItem = {
  type: 'restaurant' | 'account';
  label: string;
  sublabel: string;
  url: string;
  id: string;
};

// ---------------------------------------------------------------------------
// Global search
// ---------------------------------------------------------------------------

export async function globalSearch(
  query: string,
  limit = 10,
): Promise<SearchResultItem[]> {
  const db = getAdminSupabase();
  const term = `%${query}%`;

  const [orgsRes, profilesRes] = await Promise.all([
    // Organizations: match name or restaurant_code
    db
      .from('organizations')
      .select('id, name, restaurant_code')
      .or(`name.ilike.${term},restaurant_code.ilike.${term}`)
      .limit(limit),

    // Account profiles: match owner_name
    db
      .from('account_profiles')
      .select('auth_user_id, owner_name')
      .ilike('owner_name', term)
      .limit(limit),
  ]);

  const results: SearchResultItem[] = [];
  const seen = new Set<string>();

  // Org results
  for (const row of (orgsRes.data ?? []) as {
    id: string;
    name: string;
    restaurant_code: string;
  }[]) {
    const key = `restaurant:${row.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({
      type: 'restaurant',
      label: row.name,
      sublabel: row.restaurant_code,
      url: `/admin/restaurants/${row.id}`,
      id: row.id,
    });
  }

  // Account results
  for (const row of (profilesRes.data ?? []) as {
    auth_user_id: string;
    owner_name: string | null;
  }[]) {
    const key = `account:${row.auth_user_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({
      type: 'account',
      label: row.owner_name || row.auth_user_id.slice(0, 8) + '…',
      sublabel: row.auth_user_id,
      url: `/admin/accounts/${row.auth_user_id}`,
      id: row.auth_user_id,
    });
  }

  // Also try UUID-like search against org IDs directly
  if (/^[0-9a-f]{4,}/i.test(query)) {
    const { data: idMatch } = await db
      .from('organizations')
      .select('id, name, restaurant_code')
      .ilike('id', `${query}%`)
      .limit(3);

    for (const row of (idMatch ?? []) as {
      id: string;
      name: string;
      restaurant_code: string;
    }[]) {
      const key = `restaurant:${row.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push({
        type: 'restaurant',
        label: row.name,
        sublabel: row.restaurant_code,
        url: `/admin/restaurants/${row.id}`,
        id: row.id,
      });
    }
  }

  return results.slice(0, limit);
}
