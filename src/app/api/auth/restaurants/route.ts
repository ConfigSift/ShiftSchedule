import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseRouteClient } from '@/lib/supabase/route';
import { jsonError } from '@/lib/apiResponses';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const { supabase, response } = createSupabaseRouteClient(req);
  const { data: authData, error: authError } = await supabase.auth.getUser();
  const authUserId = authData.user?.id;
  if (!authUserId) {
    const message =
      process.env.NODE_ENV === 'production'
        ? 'Not signed in.'
        : authError?.message || 'Unauthorized.';
    return jsonError(message, 401);
  }

  const { data, error } = await supabase
    .from('organization_memberships')
    .select('organization_id, role, organizations(id,name,restaurant_code)')
    .eq('auth_user_id', authUserId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const restaurants = (data || [])
    .map((row: any) => ({
      id: row.organizations?.id ?? row.organization_id,
      name: row.organizations?.name ?? '',
      restaurant_code: row.organizations?.restaurant_code ?? '',
      role: row.role,
    }))
    .filter((row) => row.id && row.restaurant_code);

  return NextResponse.json({ restaurants });
}
