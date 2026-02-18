import { NextRequest, NextResponse } from 'next/server';
import { applySupabaseCookies } from '@/lib/supabase/route';
import { requireAdmin } from '@/lib/admin/auth';
import {
  getRestaurantOverview,
  getRestaurantLocations,
  getRestaurantEmployees,
  getRestaurantUsage,
  getRestaurantSubscription,
  getRestaurantProvisioning,
} from '@/lib/admin/queries/restaurant-detail';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> },
) {
  const result = await requireAdmin(request);
  if (!result.ok) return result.error;
  const { response } = result;

  const { orgId } = await params;

  if (!UUID_RE.test(orgId)) {
    return applySupabaseCookies(
      NextResponse.json(
        { error: 'Invalid organization ID.', requestId: crypto.randomUUID() },
        { status: 400 },
      ),
      response,
    );
  }

  const tab = request.nextUrl.searchParams.get('tab') || 'overview';
  const requestId = crypto.randomUUID();

  try {
    switch (tab) {
      case 'overview': {
        const data = await getRestaurantOverview(orgId);
        if (!data) {
          return applySupabaseCookies(
            NextResponse.json({ error: 'Organization not found.', requestId }, { status: 404 }),
            response,
          );
        }
        return applySupabaseCookies(
          NextResponse.json({ requestId, tab, ...data }),
          response,
        );
      }

      case 'locations': {
        const locations = await getRestaurantLocations(orgId);
        return applySupabaseCookies(
          NextResponse.json({ requestId, tab, locations }),
          response,
        );
      }

      case 'employees': {
        const employees = await getRestaurantEmployees(orgId);
        return applySupabaseCookies(
          NextResponse.json({ requestId, tab, employees }),
          response,
        );
      }

      case 'usage': {
        const days = Math.min(
          365,
          Math.max(1, parseInt(request.nextUrl.searchParams.get('days') ?? '7', 10) || 7),
        );
        const usage = await getRestaurantUsage(orgId, days);
        return applySupabaseCookies(
          NextResponse.json({ requestId, tab, days, usage }),
          response,
        );
      }

      case 'subscription': {
        const data = await getRestaurantSubscription(orgId);
        return applySupabaseCookies(
          NextResponse.json({ requestId, tab, ...data }),
          response,
        );
      }

      case 'provisioning': {
        const intents = await getRestaurantProvisioning(orgId);
        return applySupabaseCookies(
          NextResponse.json({ requestId, tab, intents }),
          response,
        );
      }

      default:
        return applySupabaseCookies(
          NextResponse.json({ error: `Unknown tab: ${tab}`, requestId }, { status: 400 }),
          response,
        );
    }
  } catch (err) {
    console.error(`[admin/restaurants/${orgId}]`, requestId, `tab=${tab}`, err);
    return applySupabaseCookies(
      NextResponse.json(
        { error: `Failed to load ${tab} data.`, requestId },
        { status: 500 },
      ),
      response,
    );
  }
}
