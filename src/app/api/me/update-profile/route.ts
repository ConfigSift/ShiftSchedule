import { NextRequest, NextResponse } from 'next/server';
import { applySupabaseCookies, createSupabaseRouteClient } from '@/lib/supabase/route';
import { splitFullName } from '@/utils/userMapper';

type UpdatePayload = {
  fullName: string;
  phone?: string | null;
};

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(request: NextRequest) {
  const payload = (await request.json()) as UpdatePayload;

  if (!payload.fullName || !payload.fullName.trim()) {
    return NextResponse.json({ error: 'Full name is required.' }, { status: 400 });
  }

  const { supabase, response } = createSupabaseRouteClient(request);
  const { data: sessionData } = await supabase.auth.getSession();
  const authUserId = sessionData.session?.user?.id;

  if (!authUserId) {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Unauthorized.' }, { status: 401 }),
      response
    );
  }

  const updatePayload = {
    full_name: payload.fullName.trim(),
    phone: payload.phone ?? '',
  };

  const result = await supabase
    .from('users')
    .update(updatePayload)
    .eq('auth_user_id', authUserId);

  if (result.error) {
    if (result.error.message?.toLowerCase().includes('full_name')) {
      const { firstName, lastName } = splitFullName(payload.fullName);
      const fallbackResult = await supabase
        .from('users')
        .update({
          first_name: firstName,
          last_name: lastName,
          phone: payload.phone ?? '',
        })
        .eq('auth_user_id', authUserId);
      if (fallbackResult.error) {
        return applySupabaseCookies(
          NextResponse.json({ error: fallbackResult.error.message }, { status: 400 }),
          response
        );
      }
    } else {
      return applySupabaseCookies(
        NextResponse.json({ error: result.error.message }, { status: 400 }),
        response
      );
    }
  }

  return applySupabaseCookies(NextResponse.json({ success: true }), response);
}
