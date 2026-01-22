import { NextRequest, NextResponse } from 'next/server';
import { applySupabaseCookies, createSupabaseRouteClient } from '@/lib/supabase/route';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { jsonError } from '@/lib/apiResponses';
import { normalizeUserRow } from '@/utils/userMapper';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type SendPayload = {
  organizationId: string;
  roomId: string;
  body: string;
};

export async function POST(request: NextRequest) {
  const payload = (await request.json()) as SendPayload;
  if (!payload.organizationId || !payload.roomId || !payload.body) {
    return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 });
  }

  const { supabase, response } = createSupabaseRouteClient(request);
  const { data: authData, error: authError } = await supabase.auth.getUser();
  const authUserId = authData.user?.id;
  if (!authUserId) {
    const message =
      process.env.NODE_ENV === 'production'
        ? 'Not signed in. Please sign out/in again.'
        : authError?.message || 'Unauthorized.';
    return applySupabaseCookies(jsonError(message, 401), response);
  }

  const { data: requesterRow, error: requesterError } = await supabase
    .from('users')
    .select('*')
    .eq('auth_user_id', authUserId)
    .maybeSingle();

  if (requesterError || !requesterRow) {
    return applySupabaseCookies(jsonError('Requester profile not found.', 403), response);
  }

  const requester = normalizeUserRow(requesterRow);
  if (requester.organizationId !== payload.organizationId) {
    return applySupabaseCookies(jsonError('Organization mismatch.', 403), response);
  }

  const { data: roomRow, error: roomError } = await supabaseAdmin
    .from('chat_rooms')
    .select('id,organization_id')
    .eq('id', payload.roomId)
    .maybeSingle();

  if (roomError || !roomRow) {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Chat room not found.' }, { status: 404 }),
      response
    );
  }

  if (roomRow.organization_id !== payload.organizationId) {
    return applySupabaseCookies(jsonError('Room not in this organization.', 403), response);
  }

  const { data, error } = await supabaseAdmin
    .from('chat_messages')
    .insert({
      organization_id: payload.organizationId,
      room_id: payload.roomId,
      author_auth_user_id: authUserId,
      body: payload.body,
    })
    .select('*')
    .single();

  if (error || !data) {
    return applySupabaseCookies(
      NextResponse.json({ error: error?.message ?? 'Unable to send message.' }, { status: 400 }),
      response
    );
  }

  return applySupabaseCookies(NextResponse.json({ message: data }), response);
}
