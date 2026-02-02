import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE URL or SERVICE ROLE KEY');
  process.exit(1);
}

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function computeSyntheticAuthEmail(restaurantCode, employeeNumber) {
  const code = String(restaurantCode || '').trim().toUpperCase();
  const padded = String(employeeNumber).padStart(4, '0');
  return `emp_${code}_${padded}@pin.shiftflow.local`;
}

async function listAllAuthUsers() {
  const users = [];
  let page = 1;
  const perPage = 200;
  while (true) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    users.push(...(data.users || []));
    if (!data.users || data.users.length < perPage) break;
    page += 1;
  }
  return users;
}

async function main() {
  const { data: orgs, error: orgErr } = await supabaseAdmin
    .from('organizations')
    .select('id,restaurant_code');
  if (orgErr) throw orgErr;
  const orgMap = new Map((orgs || []).map((o) => [o.id, o.restaurant_code]));

  const { data: employees, error: empErr } = await supabaseAdmin
    .from('users')
    .select('id,organization_id,employee_number,auth_user_id');
  if (empErr) throw empErr;

  const authUsers = await listAllAuthUsers();

  let created_count = 0;
  let linked_count = 0;
  let skipped_count = 0;
  let errors = 0;

  for (const employee of employees || []) {
    if (employee.auth_user_id) {
      skipped_count += 1;
      continue;
    }
    const restaurantCode = orgMap.get(employee.organization_id);
    if (!restaurantCode || !employee.employee_number) {
      skipped_count += 1;
      continue;
    }
    const syntheticEmail = computeSyntheticAuthEmail(
      restaurantCode,
      employee.employee_number
    );
    let authUser = authUsers.find(
      (u) => (u.email || '').toLowerCase() === syntheticEmail.toLowerCase()
    );
    if (!authUser) {
      const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email: syntheticEmail,
        password: '1111',
        email_confirm: true,
      });
      if (createErr || !created.user) {
        console.error('Create auth user failed', createErr?.message || 'unknown');
        errors += 1;
        continue;
      }
      authUser = created.user;
      created_count += 1;
    } else {
      linked_count += 1;
    }
    const { error: updateErr } = await supabaseAdmin
      .from('users')
      .update({ auth_user_id: authUser.id })
      .eq('id', employee.id);
    if (updateErr) {
      console.error('Link auth user failed', updateErr.message);
      errors += 1;
    }
  }

  console.log({
    created_count,
    linked_count,
    skipped_count,
    errors,
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

