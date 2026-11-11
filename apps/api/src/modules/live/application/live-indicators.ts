import { IndicatorSubscribeAckSchema, IndicatorSubscribeSchema, IndicatorUnsubscribeSchema, LiveIndicatorSchema, isSourceRef,
  type Bar, type IndicatorChartInstance, type IndicatorComputeRequest, type IndicatorResult } from '@aitrader/contracts';
import type { BarTap, SubscriptionRef } from './live-subscriptions';

type Ack = ReturnType<typeof IndicatorSubscribeAckSchema.parse>;
interface Point { barTime: number; values: Record<string, number | null> }
/** The indicator engine: computes the series, then keeps the instance for updates from saved state (FR-IN-5). */
export interface IndicatorEngine {
  open(request: IndicatorComputeRequest): Promise<{ result: IndicatorResult; stream: { push(bar: Bar): Promise<Point | null>; close(): void } }>;
}
interface Attachment { socketId: string; subscriptionId: string; instanceId: string }
interface Shared {
  key: string; ready: Promise<{ result: IndicatorResult; stream: { push(bar: Bar): Promise<Point | null>; close(): void } }>;
  lastSeq: number; attachments: Set<Attachment>;
}
type Emit = (socketId: string, event: string, payload: unknown) => void;

const MAX_PER_SOCKET = 20;
const stable = (value: unknown): string => JSON.stringify(value, (_k, v: unknown) =>
  v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))) : v);

/**
 * Live indicators on top of live bars (FR-IN-5, FR-IN-30). One engine instance per (instrument, interval, indicator, inputs),
 * shared by every socket that asks; each bar reaches it once (by sequence number) and its update goes to every listener.
 * A late joiner gets the series as it stands. The instance closes when its last listener leaves.
 */
export class LiveIndicators implements BarTap {
  private readonly shared = new Map<string, Shared>();
  private readonly bySubscription = new Map<string, Set<Attachment>>();
  /** Every indicator a bar subscription holds, so one can use another's plot as its source (FR-IN-13). */
  private readonly onChart = new Map<string, Map<string, IndicatorChartInstance>>();

  constructor(private readonly subscriptions: { describe(socketId: string, subscriptionId: string): SubscriptionRef | null },
    private readonly engine: IndicatorEngine, private readonly emit: Emit) {}

  async subscribe(socketId: string, value: unknown): Promise<Ack> {
    const parsed = IndicatorSubscribeSchema.safeParse(value);
    if (!parsed.success) return { ok: false, code: 'INVALID', message: 'Invalid indicator subscription' };
    const sub = this.subscriptions.describe(socketId, parsed.data.subscriptionId);
    if (!sub) return { ok: false, code: 'NOT_FOUND', message: 'No such bar subscription on this socket' };
    const held = [...this.bySubscription.values()].flatMap(set => [...set]).filter(a => a.socketId === socketId).length;
    if (held + parsed.data.indicators.length > MAX_PER_SOCKET) return { ok: false, code: 'LIMIT', message: `At most ${String(MAX_PER_SOCKET)} live indicators per connection` };
    const chart = this.onChart.get(sub.id) ?? new Map<string, IndicatorChartInstance>();
    this.onChart.set(sub.id, chart);
    for (const item of parsed.data.indicators) chart.set(item.instanceId, item);
    const results = await Promise.all(parsed.data.indicators.map(async item => {
      const { instanceId } = item;
      this.detach(socketId, sub.id, instanceId);
      const entry = this.acquire(sub, item, chart);
      try {
        const { result } = await entry.ready;
        const attachment = { socketId, subscriptionId: sub.id, instanceId };
        entry.attachments.add(attachment);
        const list = this.bySubscription.get(sub.id) ?? new Set<Attachment>();
        list.add(attachment); this.bySubscription.set(sub.id, list);
        return { instanceId, result };
      } catch (error) {
        if (entry.attachments.size === 0) this.shared.delete(entry.key);
        const e = error as { code?: unknown; message?: unknown };
        return { instanceId, error: { code: typeof e.code === 'string' ? e.code : 'UNAVAILABLE', message: typeof e.message === 'string' ? e.message : 'Indicator unavailable' } };
      }
    }));
    return { ok: true, results };
  }

  unsubscribe(socketId: string, value: unknown): void {
    const parsed = IndicatorUnsubscribeSchema.safeParse(value);
    if (!parsed.success) return;
    const attached = [...(this.bySubscription.get(parsed.data.subscriptionId) ?? [])].filter(a => a.socketId === socketId);
    for (const a of attached) if (!parsed.data.instanceIds || parsed.data.instanceIds.includes(a.instanceId)) this.detach(socketId, a.subscriptionId, a.instanceId);
    const chart = this.onChart.get(parsed.data.subscriptionId);
    for (const id of parsed.data.instanceIds ?? chart?.keys() ?? []) chart?.delete(id);
  }

  bar(sub: SubscriptionRef, bar: Bar, seq: number): void {
    const keys = new Set([...(this.bySubscription.get(sub.id) ?? [])].map(a => this.keyOf(a)).filter((k): k is string => k !== undefined));
    for (const key of keys) {
      const entry = this.shared.get(key);
      if (!entry || seq <= entry.lastSeq) continue; // another subscription already fed this bar
      entry.lastSeq = seq;
      void entry.ready.then(async ({ result, stream }) => {
        const point = await stream.push(bar);
        if (!point) return;
        apply(result, point);
        for (const a of entry.attachments) {
          this.emit(a.socketId, 'indicator', LiveIndicatorSchema.parse({ subscriptionId: a.subscriptionId, instanceId: a.instanceId, barTime: point.barTime, values: point.values, seq }));
        }
      }).catch(() => undefined);
    }
  }

  ended(subscriptionId: string): void {
    this.onChart.delete(subscriptionId);
    for (const a of [...(this.bySubscription.get(subscriptionId) ?? [])]) this.detach(a.socketId, subscriptionId, a.instanceId);
  }

  private acquire(sub: SubscriptionRef, item: IndicatorChartInstance, chart: ReadonlyMap<string, IndicatorChartInstance>): Shared {
    const others = reachable(item, chart);
    // A chained indicator keeps its own copy of its parents, so the key covers them (and its id, which a cycle can name).
    const key = `${sub.instrumentId}|${sub.interval}|${stable(item.indicator)}${others.length ? `|${item.instanceId}|${stable(others)}` : ''}`;
    const existing = this.shared.get(key);
    if (existing) return existing;
    const entry: Shared = { key, lastSeq: 0, attachments: new Set(),
      ready: this.engine.open({ symbol: sub.instrumentId, interval: sub.interval, indicator: item.indicator, range: { limit: 500 },
        instanceId: item.instanceId, ...(item.label && { label: item.label }), ...(others.length && { others }) }) };
    this.shared.set(key, entry);
    return entry;
  }

  private keyOf(a: Attachment): string | undefined {
    for (const entry of this.shared.values()) if (entry.attachments.has(a)) return entry.key;
    return undefined;
  }

  private detach(socketId: string, subscriptionId: string, instanceId: string): void {
    const list = this.bySubscription.get(subscriptionId);
    const a = [...(list ?? [])].find(x => x.socketId === socketId && x.instanceId === instanceId);
    if (!a || !list) return;
    list.delete(a);
    if (list.size === 0) this.bySubscription.delete(subscriptionId);
    for (const entry of this.shared.values()) {
      if (!entry.attachments.delete(a) || entry.attachments.size > 0) continue;
      this.shared.delete(entry.key);
      void entry.ready.then(({ stream }) => { stream.close(); }).catch(() => undefined);
    }
  }
}

/** The chart's other indicators that `item` reaches through source refs, by id order so equal chains give equal keys. */
function reachable(item: IndicatorChartInstance, chart: ReadonlyMap<string, IndicatorChartInstance>): IndicatorChartInstance[] {
  const found = new Map<string, IndicatorChartInstance>();
  const queue = [item];
  for (let next = queue.shift(); next; next = queue.shift()) {
    for (const value of Object.values(next.indicator.inputs)) {
      const parent = isSourceRef(value) ? chart.get(value.from) : undefined;
      if (parent && parent.instanceId !== item.instanceId && !found.has(parent.instanceId)) { found.set(parent.instanceId, parent); queue.push(parent); }
    }
  }
  return [...found.values()].sort((a, b) => a.instanceId.localeCompare(b.instanceId));
}

/** Keeps the shared series current, so the next listener starts from now: replace the last bar's values or append a bar. */
function apply(result: IndicatorResult, point: Point): void {
  const last = result.times.length - 1;
  const append = last < 0 || point.barTime > (result.times[last] ?? 0);
  if (!append && point.barTime !== result.times[last]) return;
  if (append) result.times.push(point.barTime);
  for (const plot of result.plots) {
    const value = point.values[plot.id] ?? null;
    if (append) plot.values.push(value); else plot.values[plot.values.length - 1] = value;
  }
}
