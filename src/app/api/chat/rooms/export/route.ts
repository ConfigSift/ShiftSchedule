import { NextRequest, NextResponse } from 'next/server';
import { applySupabaseCookies, createSupabaseRouteClient } from '@/lib/supabase/route';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { jsonError } from '@/lib/apiResponses';
import { normalizeUserRow } from '@/utils/userMapper';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function csvEscape(value: string) {
  const escaped = value.replace(/"/g, '""');
  return `"${escaped}"`;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const roomId = searchParams.get('roomId');
  if (!roomId) {
    return NextResponse.json({ error: 'Missing roomId.' }, { status: 400 });
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
  const organizationId = requester.organizationId;
  if (!organizationId) {
    return applySupabaseCookies(jsonError('Organization missing.', 400), response);
  }

  const { data: room, error: roomError } = await supabaseAdmin
    .from('chat_rooms')
    .select('id,name,organization_id')
    .eq('id', roomId)
    .maybeSingle();

  if (roomError || !room) {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Chat room not found.' }, { status: 404 }),
      response
    );
  }

  if (room.organization_id !== organizationId) {
    return applySupabaseCookies(jsonError('Room not in this organization.', 403), response);
  }

  const { data: messages, error: messageError } = await supabaseAdmin
    .from('chat_messages')
    .select('author_auth_user_id,body,created_at')
    .eq('room_id', roomId)
    .order('created_at', { ascending: true });

  if (messageError) {
    return applySupabaseCookies(
      NextResponse.json({ error: messageError.message }, { status: 400 }),
      response
    );
  }

  const { data: users } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('organization_id', organizationId);

  const nameByAuthId: Record<string, string> = {};
  (users || []).forEach((row) => {
    const normalized = normalizeUserRow(row);
    if (normalized.authUserId) {
      nameByAuthId[normalized.authUserId] =
        normalized.fullName || normalized.email || normalized.authUserId;
    }
  });

  const rows = ['created_at,author_name,message_body'];
  (messages || []).forEach((msg) => {
    const authorName = nameByAuthId[msg.author_auth_user_id] || msg.author_auth_user_id;
    const body = msg.body ?? '';
    rows.push(
      [msg.created_at, authorName, body].map((value) => csvEscape(String(value))).join(',')
    );
  });

  const csv = rows.join('\n');
  const dateStamp = new Date().toISOString().split('T')[0];
  const safeName = String(room.name || 'chat').replace(/[^a-z0-9-_]+/gi, '-');

  const responseCsv = new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${safeName}-${dateStamp}.csv"`,
    },
  });

  return applySupabaseCookies(responseCsv, response);
}
