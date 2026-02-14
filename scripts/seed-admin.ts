import { supabaseAdmin } from '../src/lib/supabase/admin';

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD are required.');
  }

  const { data: listData, error: listError } = await supabaseAdmin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (listError) {
    throw listError;
  }

  const existingUser = listData.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());

  let userId = existingUser?.id;
  if (!userId) {
    const { data: createData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createError) {
      throw createError;
    }
    userId = createData.user?.id ?? null;
  }

  if (!userId) {
    throw new Error('Unable to resolve admin user id.');
  }

  const now = new Date().toISOString();
  const { error: upsertError } = await supabaseAdmin
    .from('users')
    .upsert({
      auth_user_id: userId,
      email,
      full_name: 'Admin',
      phone: '',
      account_type: 'ADMIN',
      jobs: ['Admin'],
      created_at: now,
      updated_at: now,
    });

  if (upsertError) {
    throw upsertError;
  }

   
  console.log(`Admin seeded: ${email}`);
}

main().catch((error) => {
   
  console.error(error);
  process.exit(1);
});
