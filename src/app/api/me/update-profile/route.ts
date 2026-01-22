import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { splitFullName } from '@/utils/userMapper';

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

  const updatePayload = {
    full_name: payload.fullName.trim(),
    phone: payload.phone ?? '',
  };

  const result = await supabaseServer
    .from('users')
    .update(updatePayload)
    .eq('auth_user_id', authUserId);

  if (result.error) {
    if (result.error.message?.toLowerCase().includes('full_name')) {
      const { firstName, lastName } = splitFullName(payload.fullName);
      const fallbackResult = await supabaseServer
        .from('users')
        .update({
          first_name: firstName,
          last_name: lastName,
          phone: payload.phone ?? '',
        })
        .eq('auth_user_id', authUserId);
      if (fallbackResult.error) {
        return NextResponse.json({ error: fallbackResult.error.message }, { status: 400 });
      }
    } else {
      return NextResponse.json({ error: result.error.message }, { status: 400 });
    }
  }

  return NextResponse.json({ success: true });
}
