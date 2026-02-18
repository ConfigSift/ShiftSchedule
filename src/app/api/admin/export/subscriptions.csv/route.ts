import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/auth';
import { getSubscriptionsList } from '@/lib/admin/queries/subscriptions';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const result = await requireAdmin(request);
  if (!result.ok) return result.error;

  try {
    // Fetch ALL subscriptions with no real pagination limit
    const { data } = await getSubscriptionsList({}, 1, 10_000, {
      column: 'current_period_end',
      direction: 'asc',
    });

    // Build CSV
    const headers = [
      'Subscription ID',
      'Organization',
      'Restaurant Code',
      'Owner',
      'Status',
      'Period Start',
      'Period End',
      'Cancel at Period End',
      'Price ID',
      'Quantity',
    ];

    const rows = data.map((r) => [
      r.id,
      r.orgName,
      r.restaurantCode,
      r.ownerName ?? '',
      r.status,
      r.currentPeriodStart
        ? new Date(r.currentPeriodStart).toISOString().slice(0, 10)
        : '',
      r.currentPeriodEnd
        ? new Date(r.currentPeriodEnd).toISOString().slice(0, 10)
        : '',
      r.cancelAtPeriodEnd ? 'Yes' : 'No',
      r.priceId,
      String(r.quantity),
    ]);

    const csv = [headers, ...rows]
      .map((row) => row.map(escapeCsv).join(','))
      .join('\n');

    const date = new Date().toISOString().slice(0, 10);

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="crewshyft-subscriptions-${date}.csv"`,
      },
    });
  } catch (err) {
    console.error('[admin/export/subscriptions.csv]', err);
    return NextResponse.json(
      { error: 'Failed to generate CSV export.' },
      { status: 500 },
    );
  }
}

function escapeCsv(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
