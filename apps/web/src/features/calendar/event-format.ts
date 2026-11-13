import type { EventReaction, EventSpec } from '@aitrader/contracts';

export type Tone = 'up' | 'down' | 'neutral';

/** Colour of a surprise (actual minus forecast): the side the spec calls good for the currency is up-coloured; unknown or zero is neutral. */
export function surpriseTone(surprise: number | null | undefined, beat: EventSpec['beat'] | undefined): Tone {
  if (surprise == null || surprise === 0 || beat == null || beat === 'unknown') return 'neutral';
  const good = beat === 'higher-better' ? surprise > 0 : surprise < 0;
  return good ? 'up' : 'down';
}

export const TONE_CLASS: Record<Tone, string> = { up: 'text-up', down: 'text-down', neutral: 'text-muted-foreground' };

export function signed(value: number, digits = 2): string {
  return `${value > 0 ? '+' : ''}${value.toFixed(digits)}`;
}

export const shortSymbol = (symbol: string): string => symbol.slice(symbol.indexOf(':') + 1);

const pct = (move: number | null): string => move === null ? '—' : `${signed(move)}%`;

/** `NIFTY +0.12% (5m) +0.20% (15m) +0.31% (60m)`; instruments with no moves at all are left out. */
export function reactionLine(reaction: EventReaction): string | null {
  if (reaction.move5Pct === null && reaction.move15Pct === null && reaction.move60Pct === null) return null;
  return `${shortSymbol(reaction.symbol)} ${pct(reaction.move5Pct)} (5m) ${pct(reaction.move15Pct)} (15m) ${pct(reaction.move60Pct)} (60m)`;
}

export const moveText = pct;
