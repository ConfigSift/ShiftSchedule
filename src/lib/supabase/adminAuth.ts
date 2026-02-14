import { supabaseAdmin } from './admin';

type AdminUser = {
  id: string;
  email?: string | null;
};

type AdminAuthError = {
  message?: string;
} | null;

export type AdminAuthApi = {
  getUserByEmail?: (
    email: string
  ) => Promise<{ data: { user: AdminUser | null } | null; error: AdminAuthError }>;
  listUsers?: (
    params: { page: number; perPage: number }
  ) => Promise<{ data: { users: AdminUser[] } | null; error: AdminAuthError }>;
};

export function getAdminAuthApi(): AdminAuthApi {
  return supabaseAdmin.auth.admin as unknown as AdminAuthApi;
}
