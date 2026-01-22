import { supabaseAdmin } from '../src/lib/supabase/admin';

const RESTAURANT_CODE = 'RST-K7M2Q9PJ';
const RESTAURANT_NAME = 'SKYBIRD';

async function main() {
  const { data: existing, error: existingError } = await supabaseAdmin
    .from('organizations')
    .select('id')
    .eq('restaurant_code', RESTAURANT_CODE)
    .maybeSingle();

  if (existingError) {
    throw existingError;
  }

  if (existing) {
    // eslint-disable-next-line no-console
    console.log(`Restaurant already exists: ${RESTAURANT_CODE}`);
    return;
  }

  const { error: insertError } = await supabaseAdmin.from('organizations').insert({
    name: RESTAURANT_NAME,
    restaurant_code: RESTAURANT_CODE,
  });

  if (insertError) {
    throw insertError;
  }

  // eslint-disable-next-line no-console
  console.log(`Restaurant seeded: ${RESTAURANT_NAME} (${RESTAURANT_CODE})`);
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
