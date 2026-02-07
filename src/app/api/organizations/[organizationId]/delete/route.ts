import { NextRequest, NextResponse } from 'next/server';
import { applySupabaseCookies, createSupabaseRouteClient } from '@/lib/supabase/route';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { jsonError } from '@/lib/apiResponses';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type Params = { organizationId: string };

const isMissingRelation = (message?: string | null) => {
  const text = String(message ?? '').toLowerCase();
  return text.includes('relation') && text.includes('does not exist');
};

export async function POST(request: NextRequest, ctx: { params: Promise<Params> }) {
  const { organizationId: rawOrganizationId } = await ctx.params;
  const organizationId = String(rawOrganizationId ?? '').trim();
  if (!organizationId) {
    return NextResponse.json({ error: 'organizationId is required.' }, { status: 400 });
  }

  const { supabase, response } = createSupabaseRouteClient(request);
  const { data: authData, error: authError } = await supabase.auth.getUser();
  const authUserId = authData.user?.id;
  if (!authUserId) {
    const message =
      process.env.NODE_ENV === 'production'
        ? 'Not signed in. Please sign out/in again.'
        : authError?.message || 'Unauthorized.';
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.error('[org-delete] not-auth', message);
    }
    return applySupabaseCookies(jsonError(message, 401), response);
  }

  const { data: membershipRow, error: membershipError } = await supabase
    .from('organization_memberships')
    .select('role')
    .eq('organization_id', organizationId)
    .eq('auth_user_id', authUserId)
    .maybeSingle();

  if (membershipError || !membershipRow) {
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.error('[org-delete] not-admin', { membershipError });
    }
    return applySupabaseCookies(jsonError('Only admins can delete restaurants.', 403), response);
  }

  const role = String(membershipRow.role ?? '').trim().toLowerCase();
  if (role !== 'admin') {
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.error('[org-delete] not-admin', { role });
    }
    return applySupabaseCookies(jsonError('Only admins can delete restaurants.', 403), response);
  }

  const deleteByOrg = async (table: string) => {
    const { error } = await supabaseAdmin.from(table).delete().eq('organization_id', organizationId);
    if (error && !isMissingRelation(error.message)) {
      return error;
    }
    return null;
  };

  const deleteUsersScoped = async (filters: { organization_id?: string; auth_user_id?: string; email?: string }) => {
    if (!filters.organization_id) {
      if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.error('[org-delete] unsafe-global-delete-blocked');
      }
      return { message: 'Unsafe delete blocked.', status: 500 };
    }
    let query = supabaseAdmin.from('users').delete().eq('organization_id', filters.organization_id);
    if (filters.auth_user_id) {
      query = query.eq('auth_user_id', filters.auth_user_id);
    }
    if (filters.email) {
      query = query.eq('email', filters.email);
    }
    const { error } = await query;
    if (error && !isMissingRelation(error.message)) {
      return error;
    }
    return null;
  };

  // Delete chat messages + rooms (messages depend on rooms)
  const { data: roomRows, error: roomsError } = await supabaseAdmin
    .from('chat_rooms')
    .select('id')
    .eq('organization_id', organizationId);
  if (roomsError && !isMissingRelation(roomsError.message)) {
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.error('[org-delete] delete-failed', { table: 'chat_rooms', error: roomsError });
    }
    return applySupabaseCookies(
      NextResponse.json({ error: roomsError.message }, { status: 400 }),
      response
    );
  }
  const roomIds = (roomRows ?? []).map((row: any) => row.id).filter(Boolean);
  if (roomIds.length > 0) {
    const { error: messageError } = await supabaseAdmin
      .from('chat_messages')
      .delete()
      .in('room_id', roomIds);
    if (messageError && !isMissingRelation(messageError.message)) {
      if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.error('[org-delete] delete-failed', { table: 'chat_messages', error: messageError });
      }
      return applySupabaseCookies(
        NextResponse.json({ error: messageError.message }, { status: 400 }),
        response
      );
    }
  }
  if (roomIds.length > 0 || roomsError === null) {
    const chatRoomError = await deleteByOrg('chat_rooms');
    if (chatRoomError) {
      if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.error('[org-delete] delete-failed', { table: 'chat_rooms', error: chatRoomError });
      }
      return applySupabaseCookies(
        NextResponse.json({ error: chatRoomError.message }, { status: 400 }),
        response
      );
    }
  }

  const deleteOrder = [
    'shift_exchange_requests',
    'time_off_requests',
    'blocked_day_requests',
    'shifts',
    'organization_invitations',
    'schedule_view_settings',
    'business_hours',
    'locations',
    'organization_memberships',
  ];

  for (const table of deleteOrder) {
    const error = await deleteByOrg(table);
    if (error) {
      if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.error('[org-delete] delete-failed', { table, error });
      }
      return applySupabaseCookies(
        NextResponse.json({ error: error.message }, { status: 400 }),
        response
      );
    }
  }

  const usersDeleteError = await deleteUsersScoped({ organization_id: organizationId });
  if (usersDeleteError) {
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.error('[org-delete] delete-failed', { table: 'users', error: usersDeleteError });
    }
    const status = 'status' in usersDeleteError ? usersDeleteError.status : 400;
    return applySupabaseCookies(
      NextResponse.json({ error: usersDeleteError.message }, { status }),
      response
    );
  }

  const { error: orgDeleteError } = await supabaseAdmin
    .from('organizations')
    .delete()
    .eq('id', organizationId);

  if (orgDeleteError) {
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.error('[org-delete] delete-failed', { table: 'organizations', error: orgDeleteError });
    }
    return applySupabaseCookies(
      NextResponse.json({ error: orgDeleteError.message }, { status: 400 }),
      response
    );
  }

  return applySupabaseCookies(NextResponse.json({ ok: true }), response);
}
