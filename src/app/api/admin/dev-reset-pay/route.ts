import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type ResetPayload = {
  emails: string[];
};

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not allowed in production.' }, { status: 403 });
  }

  const payload = (await request.json()) as ResetPayload;
  const emails = Array.isArray(payload.emails)
    ? payload.emails.map((email) => String(email).trim()).filter(Boolean)
    : [];

  if (emails.length === 0) {
    return NextResponse.json({ error: 'Provide at least one email.' }, { status: 400 });
  }

  const { data: users, error: userError } = await supabaseAdmin
    .from('users')
    .select('id, email')
    .in('email', emails);

  if (userError) {
    return NextResponse.json({ error: userError.message }, { status: 400 });
  }

  const userIds = (users ?? []).map((user) => user.id);

  const { error: updateError } = await supabaseAdmin
    .from('users')
    .update({ job_pay: {}, hourly_pay: null })
    .in('email', emails);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  return NextResponse.json({
    success: true,
    updatedCount: emails.length,
    userIds,
  });
}
