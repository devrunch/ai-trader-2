import { CircuitBreaker, withTimeout } from '@aitrader/resilience';
import type { HistoryInstruments } from '../../application/ports/history-instruments';
import type { FillHistory } from '../../application/fill-history';
import type { CandleStore } from '../../application/ports/candle-store';
import { calendarForInstrument } from '../../domain/calendar';
import { ResilientFeed } from '../feed/resilient-feed';
import { gapBackfill } from '../feed/gap-backfill';
import { DerivWsClient } from './deriv-ws.client';

interface Dependencies {
  root?: string; clock?: () => number; watchdogMs?: number;
  instruments: HistoryInstruments; fill: Pick<FillHistory, 'execute'>; store: CandleStore;
  log: (reason: string, error: unknown) => void;
}
export function isDerivWatchdogQuietWindow(at: number): boolean {
  const date = new Date(at);
  return date.getUTCDay() === 5 && date.getUTCHours() >= 20
    && (date.getUTCHours() > 20 || date.getUTCMinutes() >= 50) && date.getUTCHours() < 22;
}
export class DerivFeed extends ResilientFeed {
  private readonly disconnect: () => void;
  constructor(deps: Dependencies) {
    const mappings = new Map<string, string>(); const clock = deps.clock ?? Date.now;
    const breaker = new CircuitBreaker({ failureThreshold: 3, openMs: 60000, now: clock });
    let client: DerivWsClient | undefined;
    super('deriv', () => {
      const socket = new DerivWsClient(deps, mappings); client = socket;
      return { connect: async signal => {
        try { await breaker.exec(() => socket.connect(signal)); }
        catch { signal.throwIfAborted(); throw new Error('PROVIDER_DOWN'); }
      }, close: () => { socket.close(); },
        sendSubscribe: keys => { socket.sendSubscribe(keys); }, sendUnsubscribe: keys => { socket.sendUnsubscribe(keys); },
        onMessage: cb => { socket.onMessage(cb); }, onClose: cb => { socket.onClose(cb); } };
    }, {
      clock, log: deps.log, ...(deps.watchdogMs === undefined ? {} : { watchdogMs: deps.watchdogMs }),
      watchdogQuiet: isDerivWatchdogQuietWindow,
      isOpen: (id, at) => calendarForInstrument(id).isOpen(at),
      resolveKey: async id => {
        const mapping = await withTimeout(signal => deps.instruments.getMapping(id, 'deriv', signal), 5000);
        if (!mapping || !/^frx[A-Z]{6}$/.test(mapping.providerSymbol)) return null;
        mappings.set(mapping.providerSymbol, id); return mapping.providerSymbol;
      },
      releaseKey: key => { mappings.delete(key); },
      backfill: gapBackfill(deps.fill, deps.store, 'deriv'),
    });
    this.disconnect = () => { client?.disconnectSocket(); };
  }
  disconnectSocket(): void { this.disconnect(); }
}
