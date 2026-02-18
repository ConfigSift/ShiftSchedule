import { NextRequest, NextResponse } from 'next/server';
import { applySupabaseCookies } from '@/lib/supabase/route';
import { requireAdmin } from '@/lib/admin/auth';
import {
  getAccountsList,
  type AccountFilters,
  type AccountSort,
} from '@/lib/admin/queries/accounts';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const result = await requireAdmin(request);
  if (!result.ok) return result.error;
  const { response } = result;

  try {
    const params = request.nextUrl.searchParams;

    const filters: AccountFilters = {
      search: params.get('search') || undefined,
      billingStatus: params.get('billingStatus') || undefined,
    };

    const page = Math.max(1, parseInt(params.get('page') ?? '1', 10) || 1);
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(params.get('pageSize') ?? '25', 10) || 25),
    );

    const sort: AccountSort = {
      column: params.get('sortColumn') || 'ownerName',
      direction: params.get('sortDirection') === 'desc' ? 'desc' : 'asc',
    };

    const data = await getAccountsList(filters, page, pageSize, sort);
    const requestId = crypto.randomUUID();

    return applySupabaseCookies(
      NextResponse.json({ requestId, ...data }),
      response,
    );
  } catch (err) {
    const requestId = crypto.randomUUID();
    console.error('[admin/accounts]', requestId, err);
    return applySupabaseCookies(
      NextResponse.json(
        { error: 'Failed to load accounts.', requestId },
        { status: 500 },
      ),
      response,
    );
  }
}
