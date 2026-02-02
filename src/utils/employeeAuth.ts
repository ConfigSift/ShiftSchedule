export function computeSyntheticAuthEmail(restaurantCode: string, employeeNumber: number): string {
  const code = String(restaurantCode).trim().toUpperCase();
  const padded = String(employeeNumber).padStart(4, '0');
  return `emp_${code}_${padded}@pin.shiftflow.local`;
}

export function validateEmployeeNumber(value: unknown): boolean {
  const num = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(num)) return false;
  if (!Number.isInteger(num)) return false;
  return num >= 1 && num <= 9999;
}

export function normalizeEmployeeNumber(value: unknown): number | null {
  const num = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(num)) return null;
  const intVal = Math.trunc(num);
  if (intVal < 1 || intVal > 9999) return null;
  return intVal;
}

export function validatePin(pin: string, mode: 'login' | 'reset' | 'create'): boolean {
  if (mode === 'login') return /^\d+$/.test(pin);
  return /^\d{4}$/.test(pin);
}
