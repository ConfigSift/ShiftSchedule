import { NextRequest, NextResponse } from 'next/server';
import { applySupabaseCookies } from '@/lib/supabase/route';
import { requireAdmin } from '@/lib/admin/auth';
import {
  getRestaurantsList,
  type RestaurantFilters,
  type RestaurantSort,
} from '@/lib/admin/queries/restaurants';
import type { ActivationStage } from '@/lib/admin/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const result = await requireAdmin(request);
  if (!result.ok) return result.error;
  const { response } = result;
  const requestId = crypto.randomUUID();

  try {
    const params = request.nextUrl.searchParams;

    const filters: RestaurantFilters = {
      search: params.get('search') || undefined,
      subscriptionStatus: params.get('subscriptionStatus') || undefined,
      activationStage: parseStage(params.get('activationStage')),
      createdAfter: params.get('createdAfter') || undefined,
      createdBefore: params.get('createdBefore') || undefined,
    };

    const page = Math.max(1, parseInt(params.get('page') ?? '1', 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(params.get('pageSize') ?? '25', 10) || 25));

    const sort: RestaurantSort = {
      column: params.get('sortColumn') || 'created_at',
      direction: params.get('sortDirection') === 'asc' ? 'asc' : 'desc',
    };

    const data = await getRestaurantsList(filters, page, pageSize, sort);
    if (process.env.NODE_ENV !== 'production') {
      console.info('[admin/restaurants]', requestId, {
        filters,
        page,
        pageSize,
        sort,
        returned: { total: data.total, pageCount: data.data.length },
      });
    }

    return applySupabaseCookies(
      NextResponse.json({ requestId, ...data }),
      response,
    );
  } catch (err) {
    console.error('[admin/restaurants]', requestId, err);
    return applySupabaseCookies(
      NextResponse.json(
        { error: 'Failed to load restaurants.', requestId },
        { status: 500 },
      ),
      response,
    );
  }
}

function parseStage(val: string | null): ActivationStage | undefined {
  if (val === null || val === '') return undefined;
  const n = parseInt(val, 10);
  if ([0, 1, 2, 3, 4].includes(n)) return n as ActivationStage;
  return undefined;
}
