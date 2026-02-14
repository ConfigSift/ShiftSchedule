import { STORAGE_KEYS, loadFromStorage, saveToStorage } from '@/utils/storage';

export type AccountPersona = 'manager' | 'employee';

export function normalizePersona(value: unknown): AccountPersona | null {
  const text = String(value ?? '').trim().toLowerCase();
  if (text === 'manager' || text === 'employee') return text;
  return null;
}

export function readStoredPersona(): AccountPersona | null {
  const value = loadFromStorage<string | null>(STORAGE_KEYS.PERSONA, null);
  return normalizePersona(value);
}

export function persistPersona(persona: AccountPersona) {
  saveToStorage(STORAGE_KEYS.PERSONA, persona);
}

export function getResolvedPersona(value: unknown): AccountPersona {
  return normalizePersona(value) ?? readStoredPersona() ?? 'manager';
}

