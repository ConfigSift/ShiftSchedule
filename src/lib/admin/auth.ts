import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseRouteClient, applySupabaseCookies } from '@/lib/supabase/route';
import { jsonError } from '@/lib/apiResponses';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AdminContext = {
  authUserId: string;
  email: string;
};

// ---------------------------------------------------------------------------
// Admin allow-list check
// ---------------------------------------------------------------------------

let cachedIds: string[] | null = null;

function getAdminIds(): string[] {
  if (cachedIds) return cachedIds;
  const raw = process.env.ADMIN_AUTH_USER_IDS ?? '';
  cachedIds = raw
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  return cachedIds;
}

/**
 * Returns `true` when `authUserId` appears in the ADMIN_AUTH_USER_IDS
 * environment variable (comma-separated allow-list).
 */
export function isAdminUser(authUserId: string): boolean {
  return getAdminIds().includes(authUserId);
}

// ---------------------------------------------------------------------------
// API route guard — call at the top of every /api/admin/* handler
// ---------------------------------------------------------------------------

type RequireAdminResult =
  | { ok: true; ctx: AdminContext; response: NextResponse }
  | { ok: false; error: NextResponse };

/**
 * Validates the caller is an authenticated platform admin.
 *
 * Usage:
 * ```ts
 * const result = await requireAdmin(request);
 * if (!result.ok) return result.error;
 * const { ctx, response } = result;
 * ```
 */
export async function requireAdmin(
  request: NextRequest,
): Promise<RequireAdminResult> {
  const { supabase, response } = createSupabaseRouteClient(request);

  const { data: authData } = await supabase.auth.getUser();
  const user = authData.user;

  if (!user?.id) {
    return {
      ok: false,
      error: applySupabaseCookies(
        jsonError('Not signed in.', 401),
        response,
      ),
    };
  }

  if (!isAdminUser(user.id)) {
    return {
      ok: false,
      error: applySupabaseCookies(
        jsonError('Forbidden — not a platform admin.', 403),
        response,
      ),
    };
  }

  const ctx: AdminContext = {
    authUserId: user.id,
    email: user.email ?? '',
  };

  return { ok: true, ctx, response };
}
