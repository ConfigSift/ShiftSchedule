import { UserRole } from '../types';

export function getUserRole(value: unknown): UserRole {
  const text = String(value ?? '').trim().toUpperCase();
  if (text === 'ADMIN') return 'ADMIN';
  if (text === 'MANAGER') return 'MANAGER';
  if (text === 'STAFF') return 'EMPLOYEE';
  if (text === 'EMPLOYEE') return 'EMPLOYEE';
  return 'EMPLOYEE';
}

export function isManagerRole(value: unknown): boolean {
  const role = getUserRole(value);
  return role === 'ADMIN' || role === 'MANAGER';
}
