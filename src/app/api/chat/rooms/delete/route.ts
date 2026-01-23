import { NextRequest, NextResponse } from 'next/server';
import { applySupabaseCookies, createSupabaseRouteClient } from '@/lib/supabase/route';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { jsonError } from '@/lib/apiResponses';
import { normalizeUserRow } from '@/utils/userMapper';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type DeletePayload = {
  roomId: string;
};

export async function DELETE(request: NextRequest) {
  let payload: DeletePayload;
  try {
    payload = (await request.json()) as DeletePayload;
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON payload.', details: 'Request body must be valid JSON.' },
      { status: 400 }
    );
  }

  if (!payload.roomId) {
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
  if (!['ADMIN', 'MANAGER'].includes(requester.role)) {
    return applySupabaseCookies(jsonError('Insufficient permissions.', 403), response);
  }

  const { data: room, error: roomError } = await supabaseAdmin
    .from('chat_rooms')
    .select('*')
    .eq('id', payload.roomId)
    .maybeSingle();

  if (roomError || !room) {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Chat room not found.' }, { status: 404 }),
      response
    );
  }

  if (room.organization_id !== requester.organizationId) {
    return applySupabaseCookies(jsonError('Room not in this organization.', 403), response);
  }

  const { error: messageDeleteError } = await supabaseAdmin
    .from('chat_messages')
    .delete()
    .eq('room_id', payload.roomId);

  if (messageDeleteError) {
    return applySupabaseCookies(
      NextResponse.json({ error: messageDeleteError.message }, { status: 400 }),
      response
    );
  }

  const { error: roomDeleteError } = await supabaseAdmin
    .from('chat_rooms')
    .delete()
    .eq('id', payload.roomId);

  if (roomDeleteError) {
    return applySupabaseCookies(
      NextResponse.json({ error: roomDeleteError.message }, { status: 400 }),
      response
    );
  }

  return applySupabaseCookies(NextResponse.json({ success: true }), response);
}
