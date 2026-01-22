import { getUserRole } from './role';
import { normalizeJobs } from './jobs';

type RawUserRow = Record<string, any>;

export type NormalizedUser = {
  id: string;
  authUserId: string | null;
  organizationId: string;
  email: string | null;
  fullName: string;
  phone: string | null;
  role: 'ADMIN' | 'MANAGER' | 'EMPLOYEE';
  jobs: string[];
};

export function normalizeUserRow(row: RawUserRow): NormalizedUser {
  const fullName =
    row.full_name
    || `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim();

  return {
    id: row.id,
    authUserId: row.auth_user_id ?? null,
    organizationId: row.organization_id,
    email: row.email ?? null,
    fullName: fullName || row.email || 'Team Member',
    phone: row.phone ?? null,
    role: getUserRole(row.account_type ?? row.role),
    jobs: normalizeJobs(row.jobs),
  };
}

export function splitFullName(fullName: string) {
  const trimmed = fullName.trim();
  if (!trimmed) return { firstName: '', lastName: '' };
  const [firstName, ...rest] = trimmed.split(' ');
  return { firstName, lastName: rest.join(' ') };
}
