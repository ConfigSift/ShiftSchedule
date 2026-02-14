import { getUserRole } from './role';
import { normalizeJobs } from './jobs';

type RawUserRow = Record<string, unknown>;

export type NormalizedUser = {
  id: string;
  authUserId: string | null;
  organizationId: string;
  email: string | null;
  realEmail?: string | null;
  employeeNumber?: number | null;
  fullName: string;
  phone: string | null;
  role: 'ADMIN' | 'MANAGER' | 'EMPLOYEE';
  jobs: string[];
  hourlyPay: number;
  jobPay: Record<string, number>;
  persona: 'manager' | 'employee';
};

function normalizePersona(value: unknown): 'manager' | 'employee' {
  const persona = String(value ?? '').trim().toLowerCase();
  return persona === 'employee' ? 'employee' : 'manager';
}

function parseJobPay(raw: unknown): Record<string, number> {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed === 'object' && parsed !== null) {
        return parsed as Record<string, number>;
      }
    } catch {
      return {};
    }
  }
  if (typeof raw === 'object' && raw !== null) {
    return raw as Record<string, number>;
  }
  return {};
}

function readString(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (value == null) return fallback;
  return String(value);
}

function readNullableString(value: unknown): string | null {
  if (value == null) return null;
  return readString(value);
}

function readNullableNumber(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function normalizeUserRow(row: RawUserRow): NormalizedUser {
  const fullName =
    readString(row.full_name)
    || `${readString(row.first_name)} ${readString(row.last_name)}`.trim();
  const hourlyPay = Number(row.hourly_pay ?? 0);
  const jobPay = parseJobPay(row.job_pay);

  return {
    id: readString(row.id),
    authUserId: readNullableString(row.auth_user_id),
    organizationId: readString(row.organization_id),
    email: readNullableString(row.email),
    realEmail: readNullableString(row.real_email),
    employeeNumber: readNullableNumber(row.employee_number),
    fullName: fullName || readString(row.email) || 'Team Member',
    phone: readNullableString(row.phone),
    role: getUserRole(row.account_type ?? row.role),
    jobs: normalizeJobs(row.jobs),
    hourlyPay: Number.isFinite(hourlyPay) ? hourlyPay : 0,
    jobPay,
    persona: normalizePersona(row.persona),
  };
}

export function splitFullName(fullName: string) {
  const trimmed = fullName.trim();
  if (!trimmed) return { firstName: '', lastName: '' };
  const [firstName, ...rest] = trimmed.split(' ');
  return { firstName, lastName: rest.join(' ') };
}
