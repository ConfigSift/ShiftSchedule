import { NextRequest, NextResponse } from 'next/server';
import { applySupabaseCookies } from '@/lib/supabase/route';
import { requireAdmin } from '@/lib/admin/auth';
import { getAccountDetail } from '@/lib/admin/queries/account-detail';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ authUserId: string }> },
) {
  const result = await requireAdmin(request);
  if (!result.ok) return result.error;
  const { response } = result;

  const { authUserId } = await params;

  if (!UUID_RE.test(authUserId)) {
    return applySupabaseCookies(
      NextResponse.json(
        { error: 'Invalid auth user ID.', requestId: crypto.randomUUID() },
        { status: 400 },
      ),
      response,
    );
  }

  try {
    const data = await getAccountDetail(authUserId);

    if (!data) {
      return applySupabaseCookies(
        NextResponse.json(
          { error: 'Account not found.', requestId: crypto.randomUUID() },
          { status: 404 },
        ),
        response,
      );
    }

    const requestId = crypto.randomUUID();

    return applySupabaseCookies(
      NextResponse.json({ requestId, ...data }),
      response,
    );
  } catch (err) {
    const requestId = crypto.randomUUID();
    console.error(`[admin/accounts/${authUserId}]`, requestId, err);
    return applySupabaseCookies(
      NextResponse.json(
        { error: 'Failed to load account details.', requestId },
        { status: 500 },
      ),
      response,
    );
  }
}
