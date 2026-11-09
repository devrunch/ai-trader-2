const price = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const formatPrice = (value: number): string => price.format(value);

/** "+30.00 (+2.04%)" / "−10.00 (−0.68%)" with a true minus sign. */
export function formatChange(change: number, pct: number): string {
  const sign = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '');
  return `${sign(change)}${price.format(Math.abs(change))} (${sign(pct)}${Math.abs(pct).toFixed(2)}%)`;
}
