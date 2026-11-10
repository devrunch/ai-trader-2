import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { buildReadTools, type ReadToolServices } from './read-tools';

const ctx = { userId: 'u1', conversationId: 'c1', turnId: 't1' };
function services() {
  const fns = { bars: vi.fn().mockResolvedValue({ bars: [], status: { state: 'ok' } }), account: vi.fn().mockResolvedValue({ cash: 1 }),
    positions: vi.fn().mockResolvedValue([]), orders: vi.fn().mockResolvedValue([]) };
  const value: ReadToolServices = {
    quote: { execute: vi.fn().mockResolvedValue({ instrumentId: 'NSE:RELIANCE', price: 1325 }) },
    market: { bars: fns.bars },
    search: { execute: vi.fn().mockReturnValue({ query: 'rel', results: [] }) },
    portfolio: { account: fns.account, positions: fns.positions, orders: fns.orders },
  };
  return { value, ...fns };
}
const deps = { limiter: { take: vi.fn().mockResolvedValue(true) }, audit: vi.fn() };

describe('agent read tools (FR-AG-4, FR-AG-5)', () => {
  it('offers only read tools: no order, cancel or broker capability exists', () => {
    const names = buildReadTools(services().value, deps).map(tool => tool.name).sort();
    expect(names).toEqual(['getBars', 'getPortfolio', 'getQuote', 'searchInstruments']);
    for (const name of names) expect(name).not.toMatch(/order|cancel|place|buy|sell|trade|broker|login|token/i);
  });

  it('getPortfolio always reads the caller’s own account, whatever the arguments say', async () => {
    const s = services();
    const tool = buildReadTools(s.value, deps).find(t => t.name === 'getPortfolio');
    await tool?.call(ctx, { userId: 'someone-else' });
    expect(s.account).toHaveBeenCalledWith('u1');
    expect(s.positions).toHaveBeenCalledWith('u1');
  });

  it('getBars caps the page size and accepts canonical ids only', async () => {
    const s = services();
    const tool = buildReadTools(s.value, deps).find(t => t.name === 'getBars');
    expect(await tool?.call(ctx, { symbol: 'NSE:RELIANCE', interval: '5', limit: 100_000 })).toMatchObject({ ok: false, reason: 'INVALID_INPUT' });
    await tool?.call(ctx, { symbol: 'NSE:RELIANCE', interval: '5', limit: 300 });
    expect(s.bars).toHaveBeenCalledWith('NSE:RELIANCE', '5', { latest: true }, 300);
  });

  // Owner decision 2026-11-10: the assistant trades PAPER only. It may use the paper engine; it can never reach a broker.
  it('no agent source file can reach a broker, a broker session or broker credentials', () => {
    const root = join(__dirname, '..');
    const files: string[] = [];
    const walk = (dir: string) => { for (const name of readdirSync(dir)) { const p = join(dir, name); if (statSync(p).isDirectory()) walk(p); else if (p.endsWith('.ts') && !p.endsWith('.spec.ts')) files.push(p); } };
    walk(root);
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      expect(source, file).not.toMatch(/KiteSessionService|ZERODHA_|placeOrder|getAccessToken|shared\/vendors|admin-ops/);
      for (const [, from] of source.matchAll(/import\s[^;]*(?:PlaceOrder|CancelOrder)[^;]*from\s+'([^']+)'/g)) expect(from, file).toBe('../paper-trading/application/index');
    }
  });
});
