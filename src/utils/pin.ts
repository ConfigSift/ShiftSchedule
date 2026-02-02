export function isValidPin(pin: string): boolean {
  return /^\d{4}$/.test(pin) && pin !== '0000';
}

export function deriveAuthPasswordFromPin(pin: string): string {
  return `${pin}${pin}`;
}
