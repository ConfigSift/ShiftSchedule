import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

type UpdatePayload = {
  fullName: string;
  phone?: string | null;
};

export async function POST(request: Request) {
  const payload = (await request.json()) as UpdatePayload;

  if (!payload.fullName || !payload.fullName.trim()) {
    return NextResponse.json({ error: 'Full name is required.' }, { status: 400 });
  }

  const supabaseServer = await createSupabaseServerClient();
  const { data: sessionData } = await supabaseServer.auth.getSession();
  const authUserId = sessionData.session?.user?.id;

  if (!authUserId) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const { error } = await supabaseServer
    .from('users')
    .update({
      full_name: payload.fullName.trim(),
      phone: payload.phone ?? '',
    })
    .eq('auth_user_id', authUserId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
