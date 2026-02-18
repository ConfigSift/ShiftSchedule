import { NextRequest, NextResponse } from 'next/server';
import { applySupabaseCookies } from '@/lib/supabase/route';
import { requireAdmin } from '@/lib/admin/auth';
import {
  getSubscriptionsList,
  getSubscriptionAggregates,
  type SubscriptionFilters,
  type SubscriptionSort,
} from '@/lib/admin/queries/subscriptions';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const result = await requireAdmin(request);
  if (!result.ok) return result.error;
  const { response } = result;

  try {
    const params = request.nextUrl.searchParams;

    // Check if aggregates-only request
    if (params.get('aggregatesOnly') === 'true') {
      const aggregates = await getSubscriptionAggregates();
      const requestId = crypto.randomUUID();
      return applySupabaseCookies(
        NextResponse.json({ requestId, aggregates }),
        response,
      );
    }

    const filters: SubscriptionFilters = {
      search: params.get('search') || undefined,
      status: params.get('status') || undefined,
      priceId: params.get('priceId') || undefined,
      cancelAtPeriodEnd: parseBool(params.get('cancelAtPeriodEnd')),
      periodEndAfter: params.get('periodEndAfter') || undefined,
      periodEndBefore: params.get('periodEndBefore') || undefined,
    };

    const page = Math.max(1, parseInt(params.get('page') ?? '1', 10) || 1);
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(params.get('pageSize') ?? '25', 10) || 25),
    );

    const sort: SubscriptionSort = {
      column: params.get('sortColumn') || 'currentPeriodEnd',
      direction: params.get('sortDirection') === 'desc' ? 'desc' : 'asc',
    };

    const [list, aggregates] = await Promise.all([
      getSubscriptionsList(filters, page, pageSize, sort),
      getSubscriptionAggregates(),
    ]);

    const requestId = crypto.randomUUID();

    return applySupabaseCookies(
      NextResponse.json({ requestId, ...list, aggregates }),
      response,
    );
  } catch (err) {
    const requestId = crypto.randomUUID();
    console.error('[admin/subscriptions]', requestId, err);
    return applySupabaseCookies(
      NextResponse.json(
        { error: 'Failed to load subscriptions.', requestId },
        { status: 500 },
      ),
      response,
    );
  }
}

function parseBool(val: string | null): boolean | undefined {
  if (val === 'true') return true;
  if (val === 'false') return false;
  return undefined;
}
