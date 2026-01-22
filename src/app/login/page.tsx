import LoginClient from './LoginClient';

type LoginPageProps = {
  searchParams?: Promise<{ notice?: string }> | { notice?: string };
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const setupDisabled = (process.env.DISABLE_SETUP ?? '').toLowerCase() === 'true';
  const resolvedParams = await Promise.resolve(searchParams ?? {});
  return <LoginClient notice={resolvedParams.notice} setupDisabled={setupDisabled} />;
}
