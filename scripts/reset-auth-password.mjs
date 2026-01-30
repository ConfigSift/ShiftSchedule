import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars.");
  process.exit(1);
}

const supabase = createClient(url, serviceKey);

const email = "obarac@gmail.com";
const newPassword = "503211";

const run = async () => {
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) throw error;

  const user = data.users.find(u => u.email?.toLowerCase() === email.toLowerCase());
  if (!user) throw new Error(`Auth user not found for ${email}`);

  const { error: updErr } = await supabase.auth.admin.updateUserById(user.id, {
    password: newPassword,
  });
  if (updErr) throw updErr;

  console.log(`✅ Password updated for ${email} (auth user id: ${user.id})`);
};

run().catch((e) => {
  console.error("❌", e.message ?? e);
  process.exit(1);
});
