import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isAdminUser } from '@/lib/admin/auth';
import { AdminSidebar } from './AdminSidebar';
import { GlobalSearch } from '@/components/admin/GlobalSearch';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();
  const user = authData.user;

  if (!user?.id) {
    redirect('/admin/login?next=/admin');
  }

  // DEBUG: log the current user's auth_user_id so you can add it to ADMIN_AUTH_USER_IDS
  console.log('[Admin] auth_user_id =', user.id, '| email =', user.email);

  if (!isAdminUser(user.id)) {
    redirect('/dashboard?notice=forbidden');
  }

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-100 text-zinc-900">
      {/* Skip to content — accessibility */}
      <a
        href="#admin-main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-indigo-600 focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white focus:shadow-lg focus:outline-none"
      >
        Skip to main content
      </a>

      {/* Sidebar */}
      <AdminSidebar email={user.email ?? ''} />

      {/* Main content area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex h-14 shrink-0 items-center gap-4 border-b border-zinc-200 bg-white pl-14 pr-6 lg:px-6">
          <h1 className="shrink-0 text-lg font-semibold text-zinc-900">
            Admin Dashboard
          </h1>
          <div className="flex-1">
            <GlobalSearch />
          </div>
          <span className="hidden shrink-0 text-sm text-zinc-500 sm:inline">{user.email}</span>
        </header>

        {/* Page content */}
        <main id="admin-main-content" className="flex-1 overflow-y-auto p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
