import type { PaperProduct } from '@aitrader/contracts';
import { roundMoney } from './money';
import type { Segment } from './segment';

/**
 * Fraction of notional blocked per unit of exposure. A simplification of SPAN plus exposure margin:
 * delivery pays in full, intraday equity gets 5x (SEBI's 20% minimum upfront margin), futures block 15%,
 * and long options block the premium. Option writing is refused by the risk gates.
 */
export function marginRate(segment: Segment, product: PaperProduct): number {
  switch (segment) {
    case 'equity': return product === 'CNC' ? 1 : 0.2;
    case 'us-equity': return product === 'CNC' ? 1 : 0.25; // US intraday buying power is 4x
    case 'futures': case 'commodity': return 0.15;
    case 'forex': return 0.05; // 20:1, a common retail limit for major pairs
    case 'options': return 1;
  }
}

interface Exposure { quantity: number; segment: Segment; product: PaperProduct }

export function usedMargin(positions: ReadonlyArray<Exposure & { averagePrice: number }>,
  openEntries: ReadonlyArray<Exposure & { price: number }>): number {
  const held = positions.reduce((sum, p) => sum + Math.abs(p.quantity) * p.averagePrice * marginRate(p.segment, p.product), 0);
  const working = openEntries.reduce((sum, o) => sum + Math.abs(o.quantity) * o.price * marginRate(o.segment, o.product), 0);
  return roundMoney(held + working);
}
