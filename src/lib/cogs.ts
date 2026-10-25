export function cogsCents(salesCents: number, foodPercent: number) {
  if (salesCents <= 0 || foodPercent <= 0) return 0;
  return Math.round((salesCents * foodPercent) / 100);
}
