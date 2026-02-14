import { NextRequest, NextResponse } from 'next/server';
import { applySupabaseCookies, createSupabaseRouteClient } from '@/lib/supabase/route';

type Persona = 'manager' | 'employee';

function normalizePersona(value: unknown): Persona | null {
  const text = String(value ?? '').trim().toLowerCase();
  if (text === 'manager' || text === 'employee') return text;
  return null;
}

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(request: NextRequest) {
  const { supabase, response } = createSupabaseRouteClient(request);
  const { data: authData } = await supabase.auth.getUser();
  const authUserId = authData.user?.id ?? null;

  if (!authUserId) {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Unauthorized.' }, { status: 401 }),
      response,
    );
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const persona = normalizePersona(body?.persona);
  if (!persona) {
    return applySupabaseCookies(
      NextResponse.json({ error: 'persona must be "manager" or "employee".' }, { status: 400 }),
      response,
    );
  }

  const updateResult = await supabase
    .from('users')
    .update({ persona })
    .eq('auth_user_id', authUserId);

  if (updateResult.error) {
    return applySupabaseCookies(
      NextResponse.json({ error: updateResult.error.message }, { status: 400 }),
      response,
    );
  }

  const { error: metadataError } = await supabase.auth.updateUser({
    data: { persona },
  });

  if (metadataError) {
    return applySupabaseCookies(
      NextResponse.json({ error: metadataError.message }, { status: 400 }),
      response,
    );
  }

  return applySupabaseCookies(
    NextResponse.json({ ok: true, persona }),
    response,
  );
}
