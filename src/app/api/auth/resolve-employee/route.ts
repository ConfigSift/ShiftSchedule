import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { computeSyntheticAuthEmail, normalizeEmployeeNumber } from '@/utils/employeeAuth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type ResolvePayload = {
  restaurantCode?: string;
  identifier?: string;
};

export async function POST(req: NextRequest) {
  try {
    const payload = (await req.json()) as ResolvePayload;
    const restaurantCode = String(payload.restaurantCode || '').trim().toUpperCase();
    const identifierRaw = String(payload.identifier || '').trim();

    if (!restaurantCode || !identifierRaw) {
      return NextResponse.json({ error: 'Missing restaurantCode or identifier.' }, { status: 400 });
    }

    const { data: orgRow, error: orgError } = await supabaseAdmin
      .from('organizations')
      .select('id,restaurant_code')
      .eq('restaurant_code', restaurantCode)
      .maybeSingle();

    if (orgError || !orgRow) {
      return NextResponse.json({ error: 'Restaurant not found.' }, { status: 404 });
    }

    const isEmail = identifierRaw.includes('@');
    let employeeRow: Record<string, unknown> | null = null;

    if (isEmail) {
      const email = identifierRaw.toLowerCase();
      const { data: row, error: empErr } = await supabaseAdmin
        .from('users')
        .select('id,auth_user_id,employee_number,real_email,email')
        .eq('organization_id', orgRow.id)
        .eq('real_email', email)
        .maybeSingle();
      if (empErr) {
        return NextResponse.json({ error: empErr.message }, { status: 500 });
      }
      employeeRow = row;
    } else {
      const employeeNumber = normalizeEmployeeNumber(identifierRaw);
      if (!employeeNumber) {
        return NextResponse.json({ error: 'Invalid employee number.' }, { status: 400 });
      }
      const { data: row, error: empErr } = await supabaseAdmin
        .from('users')
        .select('id,auth_user_id,employee_number,real_email,email')
        .eq('organization_id', orgRow.id)
        .eq('employee_number', employeeNumber)
        .maybeSingle();
      if (empErr) {
        return NextResponse.json({ error: empErr.message }, { status: 500 });
      }
      employeeRow = row;
    }

    if (!employeeRow) {
      return NextResponse.json({ error: 'Account not found for this restaurant.' }, { status: 404 });
    }

    const employeeNumber = normalizeEmployeeNumber(employeeRow.employee_number);
    if (!employeeNumber) {
      return NextResponse.json({ error: 'Employee number missing.' }, { status: 400 });
    }
    const authEmail = computeSyntheticAuthEmail(orgRow.restaurant_code, employeeNumber);

    return NextResponse.json({
      authEmail,
      authUserId: employeeRow.auth_user_id ?? null,
      legacyEmail: employeeRow.email ?? employeeRow.real_email ?? null,
    });
  } catch (e: unknown) {
    const err = e instanceof Error ? e : new Error(String(e));
    return NextResponse.json({ error: err.message ?? 'Unknown error.' }, { status: 500 });
  }
}
