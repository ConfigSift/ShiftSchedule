import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/auth';
import { getRestaurantsList } from '@/lib/admin/queries/restaurants';
import { ACTIVATION_STAGE_LABELS } from '@/lib/admin/constants';
import type { ActivationStage } from '@/lib/admin/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const result = await requireAdmin(request);
  if (!result.ok) return result.error;

  try {
    // Fetch ALL restaurants with no real pagination limit
    const { data } = await getRestaurantsList({}, 1, 10_000, {
      column: 'name',
      direction: 'asc',
    });

    // Build CSV
    const headers = [
      'Org ID',
      'Name',
      'Restaurant Code',
      'Timezone',
      'Owner',
      'Subscription Status',
      'Period End',
      'Locations',
      'Employees',
      'Active Employees',
      'Shifts 7d',
      'Shifts 30d',
      'Activation Stage',
    ];

    const rows = data.map((r) => [
      r.orgId,
      r.name,
      r.restaurantCode,
      r.timezone,
      r.ownerName ?? '',
      r.subscriptionStatus ?? 'none',
      r.currentPeriodEnd
        ? new Date(r.currentPeriodEnd).toISOString().slice(0, 10)
        : '',
      String(r.locationsCount),
      String(r.employeesCount),
      String(r.activeEmployeesCount),
      String(r.shifts7d),
      String(r.shifts30d),
      ACTIVATION_STAGE_LABELS[r.activationStage as ActivationStage] ??
        String(r.activationStage),
    ]);

    const csv = [headers, ...rows]
      .map((row) => row.map(escapeCsv).join(','))
      .join('\n');

    const date = new Date().toISOString().slice(0, 10);

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="crewshyft-restaurants-${date}.csv"`,
      },
    });
  } catch (err) {
    console.error('[admin/export/restaurants.csv]', err);
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
