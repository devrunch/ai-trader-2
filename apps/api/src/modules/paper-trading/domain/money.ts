/** Rupees to paise precision, half away from zero; the epsilon absorbs binary noise such as 2.9997 × 100. */
export function roundMoney(value: number): number {
  return Math.sign(value) * Math.round((Math.abs(value) + Number.EPSILON) * 100) / 100;
}

const TICK_EPSILON = 1e-9;

/** Rounds a price to a multiple of the tick, in the given direction. */
export function roundToTick(price: number, tick: number, direction: 'up' | 'down'): number {
  const steps = price / tick;
  const whole = direction === 'up' ? Math.ceil(steps - TICK_EPSILON) : Math.floor(steps + TICK_EPSILON);
  return Math.round(whole * tick * 1e6) / 1e6;
}

export function isTickMultiple(price: number, tick: number): boolean {
  const steps = price / tick;
  return Math.abs(steps - Math.round(steps)) < 1e-6;
}
