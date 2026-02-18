import { NextRequest, NextResponse } from 'next/server';
import { applySupabaseCookies } from '@/lib/supabase/route';
import { requireAdmin } from '@/lib/admin/auth';
import {
  getProvisioningList,
  getProvisioningSummary,
  type ProvisioningFilters,
  type ProvisioningSort,
} from '@/lib/admin/queries/provisioning';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const result = await requireAdmin(request);
  if (!result.ok) return result.error;
  const { response } = result;

  try {
    const params = request.nextUrl.searchParams;

    const filters: ProvisioningFilters = {
      status: params.get('status') || undefined,
      hasError: params.get('hasError') === 'true' ? true : undefined,
      createdAfter: params.get('createdAfter') || undefined,
      createdBefore: params.get('createdBefore') || undefined,
    };

    const page = Math.max(1, parseInt(params.get('page') ?? '1', 10) || 1);
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(params.get('pageSize') ?? '25', 10) || 25),
    );

    const sort: ProvisioningSort = {
      column: params.get('sortColumn') || 'created_at',
      direction: params.get('sortDirection') === 'asc' ? 'asc' : 'desc',
    };

    const [list, summary] = await Promise.all([
      getProvisioningList(filters, page, pageSize, sort),
      getProvisioningSummary(),
    ]);

    const requestId = crypto.randomUUID();

    return applySupabaseCookies(
      NextResponse.json({ requestId, ...list, summary }),
      response,
    );
  } catch (err) {
    const requestId = crypto.randomUUID();
    console.error('[admin/provisioning]', requestId, err);
    return applySupabaseCookies(
      NextResponse.json(
        { error: 'Failed to load provisioning data.', requestId },
        { status: 500 },
      ),
      response,
    );
  }
}
