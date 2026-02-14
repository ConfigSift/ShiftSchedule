import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { OnboardingBackground } from '../onboarding/OnboardingBackground';
import { OnboardingStepper } from '../onboarding/OnboardingStepper';
import SetupClient from './SetupClient';

export const dynamic = 'force-dynamic';

export default async function SetupPage() {
  if ((process.env.DISABLE_SETUP ?? '').toLowerCase() === 'true') {
    redirect('/login?notice=setup-disabled');
  }

  const supabase = await createSupabaseServerClient();
  let userId: string | null = null;
  try {
    const { data } = await supabase.auth.getUser();
    userId = data.user?.id ?? null;
  } catch {
    userId = null;
  }

  if (!userId) {
    return <SetupClient />;
  }

  return (
    <OnboardingBackground>
      <OnboardingStepper />
    </OnboardingBackground>
  );
}
