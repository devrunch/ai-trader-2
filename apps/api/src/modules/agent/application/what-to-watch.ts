import { WatchDraftSchema, type WatchItem, type WhatToWatchResponse } from '@aitrader/contracts';
import { NotFoundError, ValidationError } from '../../../shared/errors';
import { dueAt, judge } from '../domain/watch-outcome';

export interface StoredWatch { id: string; createdAt: number; items: WatchItem[] }
export interface WatchStore {
  latest(userId: string): Promise<StoredWatch | null>;
  recent(userId: string, limit: number): Promise<StoredWatch[]>;
  save(userId: string, list: StoredWatch): Promise<void>;
  /** Lists with items still open, for the job that judges them. */
  open(limit: number): Promise<Array<{ userId: string; list: StoredWatch }>>;
}
export interface WatchQuote { price: number; changePct: number | null }
export interface WatchInputs {
  symbols(userId: string): Promise<string[]>;
  quotes(symbols: string[]): Promise<Map<string, WatchQuote>>;
  headlines(): Promise<Array<{ title: string; sources: number; sentiment: string | null; symbols: string[] }>>;
  events(): Promise<Array<{ title: string; country: string; at: string; impact: string; forecast: string | null; previous: string | null; moves: string[] }>>;
}
export interface WatchModel { draft(system: string, prompt: string): Promise<unknown> }
export interface WatchTasks {
  create(userId: string, input: { title: string; instruction: string; trigger: { kind: 'price'; symbol: string; op: 'above' | 'below'; value: number }; maxRuns: number; expiresInDays: number }): Promise<{ id: string }>;
}

const REFRESH_GAP_MS = 30 * 60_000;
/** Owner decision: tasks watch for one to two hours. */
const FOLLOW_HOURS = 2;
const SYSTEM = 'You write "What to watch" for one trader: the few things most likely to move what they follow, and why. '
  + 'Use only the data in the message; never invent prices, levels, news or events. Use only symbols that appear in the data. '
  + 'Each item: a plain title of at most 12 words a trader understands at a glance; "why" in one or two sentences with the numbers from the data; '
  + 'the direction you expect (up, down, volatile, or watch when there is no clear side); how sure you are (0 to 1); today or this week; '
  + 'and, when there is a clear level, a follow level on one of the item\'s symbols that the user can watch. Give your real view; do not hedge every item. '
  + 'Order the items by how much they matter. Reply with the JSON object only.';

const ticker = (s: string): string => s.split(':')[1] ?? s;
const pct = (n: number | null): string => (n === null ? 'n/a' : `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`);

/** "What to watch": the assistant's list of what is likely to move the user's markets today, each item followable and judged afterwards. */
export class WhatToWatch {
  constructor(private readonly store: WatchStore, private readonly inputs: WatchInputs, private readonly model: WatchModel, private readonly tasks: WatchTasks,
    private readonly env: { now: () => number; id: () => string }) {}

  async get(userId: string): Promise<WhatToWatchResponse> {
    const latest = await this.store.latest(userId);
    const recent = await this.store.recent(userId, 30);
    const resolved = recent.flatMap(l => l.items).filter(i => i.outcome === 'right' || i.outcome === 'wrong');
    const record = { right: resolved.filter(i => i.outcome === 'right').length, wrong: resolved.filter(i => i.outcome === 'wrong').length, total: resolved.length };
    return { list: latest ? { id: latest.id, createdAt: new Date(latest.createdAt).toISOString(), items: latest.items, record } : null,
      canRefreshAt: latest ? new Date(latest.createdAt + REFRESH_GAP_MS).toISOString() : null };
  }

  /** Writes a fresh list from the latest prices, headlines and events. A list younger than 30 minutes is kept unless forced (the morning job). */
  async refresh(userId: string, force = false): Promise<WhatToWatchResponse> {
    const latest = await this.store.latest(userId);
    if (!force && latest && this.env.now() - latest.createdAt < REFRESH_GAP_MS) return this.get(userId);
    const symbols = await this.inputs.symbols(userId);
    const [quotes, headlines, events] = await Promise.all([this.inputs.quotes(symbols), this.inputs.headlines(), this.inputs.events()]);
    const known = new Set([...quotes.keys()]);
    const prompt = [
      `Now: ${new Date(this.env.now()).toISOString()} (IST is UTC+5:30).`,
      'Prices:', ...[...quotes].map(([s, q]) => `- ${s}: ${String(q.price)} (${pct(q.changePct)} today)`),
      'Upcoming events (next 24h):', ...(events.length ? events.map(e => `- ${e.at} ${e.country} ${e.title} [${e.impact}] forecast ${e.forecast ?? 'n/a'}, previous ${e.previous ?? 'n/a'}; moves ${e.moves.join(', ')}`) : ['- none']),
      'Headlines (story, number of sources, sentiment, symbols):', ...(headlines.length ? headlines.map(h => `- ${h.title} | ${String(h.sources)} sources | ${h.sentiment ?? 'n/a'} | ${h.symbols.join(', ')}`) : ['- none']),
    ].join('\n');
    const draft = WatchDraftSchema.parse(await this.model.draft(SYSTEM, prompt));
    const items: WatchItem[] = draft.items
      .map(d => ({ ...d, symbols: d.symbols.filter(s => known.has(s)), follow: d.follow && known.has(d.follow.symbol) ? d.follow : null }))
      .filter(d => d.symbols.length > 0)
      .map(d => ({ ...d, id: this.env.id(), refPrices: Object.fromEntries(d.symbols.flatMap(s => { const q = quotes.get(s); return q ? [[s, q.price]] : []; })),
        outcome: 'open' as const, movePct: null, resolvedAt: null, taskId: null }));
    if (items.length === 0) throw new ValidationError('No usable items: the model named no symbol we have prices for. Try again in a few minutes.');
    await this.store.save(userId, { id: this.env.id(), createdAt: this.env.now(), items });
    return this.get(userId);
  }

  /** Following an item creates a task that watches its level for two hours and acts within the user's limits. */
  async follow(userId: string, itemId: string): Promise<WhatToWatchResponse> {
    const latest = await this.store.latest(userId);
    const item = latest?.items.find(i => i.id === itemId);
    if (!latest || !item) throw new NotFoundError('That item is no longer in What to watch', { itemId });
    if (!item.follow) throw new ValidationError('This item has no level to watch; ask the assistant about it instead.');
    if (item.taskId) return this.get(userId);
    const f = item.follow;
    const task = await this.tasks.create(userId, {
      title: `Watching ${ticker(f.symbol)}: ${f.op === 'above' ? 'breaks above' : 'falls below'} ${String(f.value)}`,
      instruction: `From What to watch: "${item.title}". ${item.why} When ${f.symbol} goes ${f.op} ${String(f.value)}, decide whether to trade it on paper within my limits, and tell me plainly what you did and why.`,
      trigger: { kind: 'price', symbol: f.symbol, op: f.op, value: f.value }, maxRuns: 1, expiresInDays: FOLLOW_HOURS / 24 });
    await this.store.save(userId, { ...latest, items: latest.items.map(i => (i.id === itemId ? { ...i, taskId: task.id } : i)) });
    return this.get(userId);
  }

  /** Judges items whose time is up against how their first symbol moved; returns how many were judged. */
  async judgeDue(): Promise<number> {
    const now = this.env.now();
    let judged = 0;
    for (const { userId, list } of await this.store.open(200)) {
      const due = list.items.filter(i => i.outcome === 'open' && dueAt(list.createdAt, i.horizon) <= now);
      if (due.length === 0) continue;
      const quotes = await this.inputs.quotes([...new Set(due.map(i => i.symbols[0] ?? ''))].filter(Boolean));
      const items = list.items.map(i => {
        if (!due.includes(i)) return i;
        const first = i.symbols[0] ?? '';
        const ref = i.refPrices[first]; const now = quotes.get(first)?.price;
        const movePct = ref && now ? ((now - ref) / ref) * 100 : null;
        judged++;
        return { ...i, outcome: judge(i, movePct), movePct: movePct === null ? null : Math.round(movePct * 100) / 100, resolvedAt: new Date(this.env.now()).toISOString() };
      });
      await this.store.save(userId, { ...list, items });
    }
    return judged;
  }
}
