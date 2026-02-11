export function normalizePin(pin: string): string {
  const trimmed = String(pin ?? '').trim();
  if (/^\d{6}$/.test(trimmed)) return trimmed;
  throw new Error('PIN must be 6 digits');
}
