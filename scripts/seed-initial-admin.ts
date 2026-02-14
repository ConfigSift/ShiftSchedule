import { supabaseAdmin } from '../src/lib/supabase/admin';

const DEFAULT_EMAIL = 'ggodo@oakland.edu';
const DEFAULT_PASSCODE = '503211';
const DEFAULT_RESTAURANT_CODE = 'RST-K7M2Q9PJ';
const DEFAULT_RESTAURANT_NAME = 'Oakland Test Restaurant';
const DEFAULT_FULL_NAME = 'Genti Godo';

async function findAuthUserByEmail(email: string) {
  let page = 1;
  const perPage = 200;
  const normalized = email.toLowerCase();

  while (true) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw error;
    }

    const match = data.users.find((user) => user.email?.toLowerCase() === normalized);
    if (match) {
      return match;
    }

    const total = data.total ?? 0;
    if (page * perPage >= total) {
      break;
    }
    page += 1;
  }

  return null;
}

async function main() {
  const email = process.env.ADMIN_EMAIL ?? DEFAULT_EMAIL;
  const passcode = process.env.ADMIN_PASSWORD ?? DEFAULT_PASSCODE;
  const restaurantCode = process.env.ADMIN_RESTAURANT_CODE ?? DEFAULT_RESTAURANT_CODE;
  const restaurantName = process.env.ADMIN_RESTAURANT_NAME ?? DEFAULT_RESTAURANT_NAME;
  const fullName = process.env.ADMIN_FULL_NAME ?? DEFAULT_FULL_NAME;

  if (!/^\d{6}$/.test(passcode)) {
    throw new Error('ADMIN_PASSWORD must be exactly 6 digits.');
  }

  const { data: orgData, error: orgError } = await supabaseAdmin
    .from('organizations')
    .select('id,restaurant_code')
    .eq('restaurant_code', restaurantCode)
    .maybeSingle();

  if (orgError) {
    throw orgError;
  }

  let organizationId = orgData?.id;
  if (!organizationId) {
    const { data: newOrg, error: newOrgError } = await supabaseAdmin
      .from('organizations')
      .insert({
        name: restaurantName,
        restaurant_code: restaurantCode,
      })
      .select('id')
      .single();
    if (newOrgError) {
      throw newOrgError;
    }
    organizationId = newOrg.id;
  }

  const existingAuthUser = await findAuthUserByEmail(email);
  let authUserId = existingAuthUser?.id ?? null;
  if (!authUserId) {
    const { data: createData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: passcode,
      email_confirm: true,
    });
    if (createError) {
      throw createError;
    }
    authUserId = createData.user?.id ?? null;
  } else {
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(authUserId, {
      password: passcode,
    });
    if (updateError) {
      throw updateError;
    }
  }

  if (!authUserId) {
    throw new Error('Unable to resolve auth user id.');
  }

  const { error: upsertError } = await supabaseAdmin
    .from('users')
    .upsert(
      {
        auth_user_id: authUserId,
        organization_id: organizationId,
        email,
        full_name: fullName,
        phone: '',
        account_type: 'ADMIN',
        jobs: ['Admin'],
      },
      { onConflict: 'auth_user_id' }
    );

  if (upsertError) {
    throw upsertError;
  }

   
  console.log(
    `Seeded ADMIN ${email} for ${restaurantCode}. Passcode ending: ${passcode.slice(-2)}`
  );
}

main().catch((error) => {
   
  console.error(error);
  process.exit(1);
});
