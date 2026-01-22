import { redirect } from 'next/navigation';
import SetupClient from './SetupClient';

export default function SetupPage() {
  if ((process.env.DISABLE_SETUP ?? '').toLowerCase() === 'true') {
    redirect('/login?notice=setup-disabled');
  }

  return <SetupClient />;
}
