export function isFourDigitPin(pin: string): boolean {
  return /^\d{4}$/.test(pin) && pin !== '0000';
}

export function pinToAuthPassword(pin: string): string {
  return `PIN-${pin}`;
}

export function normalizeLoginPassword(input: string): string {
  return isFourDigitPin(input) ? pinToAuthPassword(input) : input;
}
