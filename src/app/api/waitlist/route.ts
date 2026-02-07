import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, restaurant_name, employee_count } = body;

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      // Still return success to the user even if Supabase isn't configured
      console.warn('Supabase not configured — waitlist submission logged only');
      console.log('Waitlist submission:', { email, restaurant_name, employee_count });
      return NextResponse.json({ success: true });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Try to insert — table may not exist yet, handle gracefully
    const { error } = await supabase.from('waitlist').upsert(
      {
        email: email.toLowerCase().trim(),
        restaurant_name: restaurant_name || null,
        employee_count: employee_count ? parseInt(String(employee_count)) : null,
      },
      { onConflict: 'email' }
    );

    if (error) {
      // If table doesn't exist, log and still return success
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        console.warn('Waitlist table does not exist. Run the SQL migration to create it.');
        console.log('Waitlist submission:', { email, restaurant_name, employee_count });
        return NextResponse.json({ success: true });
      }
      console.error('Waitlist insert error:', error);
      return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Waitlist API error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
