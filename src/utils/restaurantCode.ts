export function generateRestaurantCode(): string {
  const digits = Math.floor(Math.random() * 10000)
    .toString()
    .padStart(4, '0');
  return `RST${digits}`;
}
