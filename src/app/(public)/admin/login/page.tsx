import AdminLoginClient from './AdminLoginClient';

type AdminLoginSearchParams = {
  next?: string | string[];
};

type AdminLoginPageProps = {
  searchParams?: Promise<AdminLoginSearchParams> | AdminLoginSearchParams;
};

export default async function AdminLoginPage({ searchParams }: AdminLoginPageProps) {
  const resolvedParams = await Promise.resolve(searchParams ?? {});
  const nextPath = Array.isArray(resolvedParams.next) ? resolvedParams.next[0] : resolvedParams.next;
  return <AdminLoginClient nextPath={nextPath} />;
}
