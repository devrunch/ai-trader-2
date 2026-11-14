import { describe, expect, it } from 'vitest';
import type { AgentProfile, LearnedItem } from '@aitrader/contracts';
import { NotFoundError, ValidationError } from '../../../shared/errors';
import { AgentMemory } from './agent-memory';
import { AgentProfileService, type SignalInput } from './agent-profile';
import { buildProfileTools } from './profile-tools';
import { TurnToolLog } from './turn-tool-log';
import { summarizeSignals, topicOf } from '../domain/profile';

const U = 'u1';
const GROUPS: Record<string, string> = { runBacktest: 'strategies', scanUniverse: 'screening' };

function service() {
  let profile: AgentProfile = {};
  const signals: Array<LearnedItem & { userId: string; eventKey: string }> = [];
  const turns: string[][] = [['getQuote', 'scanUniverse'], ['runBacktest']];
  let n = 0;
  const notes: Array<{ id: string; note: string; createdAt: string }> = [];
  const memory = new AgentMemory({
    list: () => Promise.resolve(notes), add: (_u, x) => { notes.push({ ...x, createdAt: 'x' }); return Promise.resolve(); },
    remove: () => Promise.resolve(false) }, { id: () => 'n' });
  const svc = new AgentProfileService(
    { get: () => Promise.resolve(profile), set: (_u, p) => { profile = p; return Promise.resolve(); } },
    { record: (userId, id, s: SignalInput) => {
        if (signals.some(x => x.userId === userId && x.eventKey === s.eventKey)) return Promise.resolve(false);
        signals.push({ id, userId, eventKey: s.eventKey, kind: s.kind, topic: s.topic, tools: s.tools, createdAt: 'x' });
        return Promise.resolve(true);
      },
      list: userId => Promise.resolve(signals.filter(x => x.userId === userId)),
      remove: (userId, id) => { const before = signals.length; for (let i = signals.length - 1; i >= 0; i--) if (signals[i]?.userId === userId && (id === null || signals[i]?.id === id)) signals.splice(i, 1); return Promise.resolve(before - signals.length); },
      turnTools: (_u, _t, i) => Promise.resolve(turns[i] ?? null) },
    memory, { id: () => `id-${String(++n)}` }, tool => GROUPS[tool]);
  return { svc, signals, notes };
}

describe('assistant profile', () => {
  it('updates the profile from a stated preference through the updateProfile tool', async () => {
    const { svc } = service();
    const [tool] = buildProfileTools(svc, { limiter: { take: () => Promise.resolve(true) }, audit: () => undefined });
    const out = await tool?.call({ userId: U, conversationId: 'c', turnId: 't' }, { instruments: ['BANKNIFTY options'], length: 'short', riskPerTradePct: 1 });
    expect(out).toMatchObject({ ok: true });
    expect(await svc.get(U)).toEqual({ instruments: ['BANKNIFTY options'], length: 'short', riskPerTradePct: 1 });
    await svc.update(U, { length: null, autonomy: 'ask' });
    expect(await svc.get(U)).toEqual({ instruments: ['BANKNIFTY options'], riskPerTradePct: 1, autonomy: 'ask' });
  });

  it('rejects an invalid profile value', async () => {
    const { svc } = service();
    await expect(svc.update(U, { riskPerTradePct: 400 })).rejects.toBeInstanceOf(ValidationError);
  });

  it('records a thumbs mark once per reply, with that turn\'s tools and topic', async () => {
    const { svc, signals } = service();
    await svc.thumbs(U, 't', 0, 'up');
    await svc.thumbs(U, 't', 0, 'up');
    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({ kind: 'thumb-up', topic: 'screening', tools: ['getQuote', 'scanUniverse'] });
    await expect(svc.thumbs(U, 't', 9, 'down')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('records a card decision once, even when applied twice', async () => {
    const { svc, signals } = service();
    await svc.signal(U, { eventKey: 'card:1:applied', kind: 'card-applied', topic: 'card:draw', tools: [] });
    await svc.signal(U, { eventKey: 'card:1:applied', kind: 'card-applied', topic: 'card:draw', tools: [] });
    expect(signals).toHaveLength(1);
  });

  it('builds a bounded, deterministic summary', () => {
    const data = [
      { kind: 'thumb-up', topic: 'screening', tools: ['scanUniverse', 'getQuote'] }, { kind: 'thumb-up', topic: 'screening', tools: ['scanUniverse'] },
      { kind: 'thumb-down', topic: 'strategies', tools: ['runBacktest'] }, { kind: 'card-applied', topic: 'card:draw', tools: [] },
      { kind: 'alert-kept', topic: 'ignored', tools: [] },
    ];
    const expected = '- screening: 2 accepted, 0 rejected; worked: scanUniverse, getQuote\n- card:draw: 1 accepted, 0 rejected\n- strategies: 0 accepted, 1 rejected';
    expect(summarizeSignals(data)).toBe(expected);
    expect(summarizeSignals([...data].reverse())).toBe(expected);
    const many = Array.from({ length: 100 }, (_, i) => ({ kind: 'thumb-up', topic: `topic-${String(i).padStart(3, '0')}-${'x'.repeat(200)}`, tools: ['a'] }));
    expect(summarizeSignals(many).length).toBeLessThanOrEqual(1000);
    expect(topicOf(['getQuote', 'runBacktest'], t => GROUPS[t])).toBe('strategies');
    expect(topicOf(['getQuote'], t => GROUPS[t])).toBe('general');
  });

  it('injects profile, notes and what works in one block, and nothing when empty', async () => {
    const { svc } = service();
    expect(await svc.promptFor(U)).toBe('');
    await svc.update(U, { length: 'short', format: 'text', autonomy: 'within-limits', markets: ['NSE'] });
    await svc.thumbs(U, 't', 1, 'up');
    const block = await svc.promptFor(U);
    expect(block).toContain('Markets: NSE');
    expect(block).toContain('Prefers: short answers, plain text over cards');
    expect(block).toContain('may act on its own inside the risk limits');
    expect(block).toContain('- strategies: 1 accepted, 0 rejected; worked: runBacktest');
  });

  it('lets the user delete any learned item or all of them, and edit or clear the profile', async () => {
    const { svc, signals } = service();
    await svc.thumbs(U, 't', 0, 'up');
    await svc.thumbs(U, 't', 1, 'down');
    const [first] = (await svc.knowledge(U)).learned;
    await svc.forgetLearned(U, first?.id ?? '');
    expect(signals).toHaveLength(1);
    await expect(svc.forgetLearned(U, 'missing')).rejects.toBeInstanceOf(NotFoundError);
    await svc.forgetLearned(U, null);
    expect((await svc.knowledge(U)).learned).toEqual([]);
    await svc.update(U, { language: 'Hindi' });
    await svc.replace(U, {});
    expect(await svc.get(U)).toEqual({});
  });

  it('keeps each turn\'s distinct tools and clears them once taken', () => {
    const log = new TurnToolLog();
    log.add('t', 'getQuote'); log.add('t', 'getQuote'); log.add('t', 'runBacktest');
    expect(log.take('t')).toEqual(['getQuote', 'runBacktest']);
    expect(log.take('t')).toEqual([]);
  });
});
