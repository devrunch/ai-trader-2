/** At most one alert per key per window, across processes (Redis SET NX PX). */
export class AlertGate {
  constructor(private readonly redis: { set(key: string, value: string, px: 'PX', ms: number, nx: 'NX'): Promise<string | null> }) {}
  async open(key: string, windowMs: number): Promise<boolean> {
    return (await this.redis.set(`alert:${key}`, '1', 'PX', windowMs, 'NX')) === 'OK';
  }
}
