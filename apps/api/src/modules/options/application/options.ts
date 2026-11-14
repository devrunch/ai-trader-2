import type { OptionChain, OptionsSummary } from '@aitrader/contracts';
import { NotFoundError, ValidationError } from '../../../shared/errors';
import { buildups, maxPain, nearestStrike, pcr } from '../domain/chain-stats';
import { impliedVolPct } from '../domain/implied-vol';
import type { OptionContract, OptionContracts, OptionQuotes, OptionSnapshot, OptionSnapshotStore } from './ports/options-ports';

/** A snapshot younger than this answers repeat reads, so a busy chart panel costs one Kite call a minute per expiry. */
const FRESH_MS = 60_000;
const IST_MS = 19_800_000;
const DAY_MS = 86_400_000;
const BUILDUPS = 5;

const istDate = (ms: number): string => new Date(ms + IST_MS).toISOString().slice(0, 10);
const istMidnight = (ms: number): number => Math.floor((ms + IST_MS) / DAY_MS) * DAY_MS - IST_MS;
/** Stock and index options stop trading with the cash market. */
const expiryMs = (expiry: string): number => Date.parse(`${expiry}T15:30:00+05:30`);

interface Loaded { snapshot: OptionSnapshot; expiries: string[]; expiry: string; baseline: Map<string, number> }

/** Option chains of NSE F&O underlyings: Kite quotes (price, open interest) kept as short-lived snapshots, with open-interest change against the previous trading day's last snapshot. */
export class OptionsService {
  constructor(private readonly contracts: OptionContracts, private readonly quotes: OptionQuotes, private readonly store: OptionSnapshotStore,
    private readonly env: { now: () => number; warn?: (message: string, detail: Record<string, unknown>) => void }) {}

  /** Strikes near the money with price, open interest, its change and implied volatility. `asOf` reads the stored snapshot at that moment and never calls the vendor. */
  async chain(underlying: string, q: { expiry?: string | undefined; strikes: number; asOf?: number | undefined }, signal: AbortSignal): Promise<OptionChain | null> {
    const loaded = await this.load(underlying, q.expiry, q.asOf, signal);
    if (!loaded) return null;
    const { snapshot, expiries, expiry, baseline } = loaded;
    const strikes = [...new Set(snapshot.legs.map(l => l.strike))].sort((a, b) => a - b);
    const atm = snapshot.spot === null ? null : nearestStrike(strikes, snapshot.spot);
    const middle = atm === null ? Math.floor(strikes.length / 2) : strikes.indexOf(atm);
    const near = strikes.slice(Math.max(0, middle - q.strikes), middle + q.strikes + 1);
    const leg = (strike: number, type: 'CE' | 'PE') => {
      const l = snapshot.legs.find(x => x.strike === strike && x.type === type);
      const before = l ? baseline.get(l.symbol) : undefined;
      return l ? { symbol: l.symbol, ltp: l.ltp, oi: l.oi, oiChange: l.oi !== null && before !== undefined ? l.oi - before : null, volume: l.volume,
        iv: impliedVolPct(type, l.ltp, snapshot.spot, strike, expiryMs(expiry), snapshot.takenAt) } : null;
    };
    return { underlying: snapshot.underlying, expiry, expiries, spot: snapshot.spot, atm, rows: near.map(strike => ({ strike, ce: leg(strike, 'CE'), pe: leg(strike, 'PE') })),
      source: 'kite', fetchedAt: new Date(snapshot.takenAt).toISOString() };
  }

  /** Put-call ratio by open interest, max pain and the biggest open-interest build-ups over the whole expiry. */
  async summary(underlying: string, q: { expiry?: string | undefined; asOf?: number | undefined }, signal: AbortSignal): Promise<OptionsSummary | null> {
    const loaded = await this.load(underlying, q.expiry, q.asOf, signal);
    if (!loaded) return null;
    const { snapshot, expiry, baseline } = loaded;
    const total = (type: 'CE' | 'PE'): number => snapshot.legs.filter(l => l.type === type).reduce((sum, l) => sum + (l.oi ?? 0), 0);
    return { underlying: snapshot.underlying, expiry, pcr: pcr(snapshot.legs), maxPain: maxPain(snapshot.legs), totalCeOi: total('CE'), totalPeOi: total('PE'),
      buildups: buildups(snapshot.legs, baseline, BUILDUPS), source: 'kite', fetchedAt: new Date(snapshot.takenAt).toISOString() };
  }

  /** Takes a snapshot for the close job so tomorrow has a baseline. */
  async capture(underlying: string, signal: AbortSignal): Promise<number> {
    const now = this.env.now();
    const listed = await this.contracts.list(underlying, istDate(now), signal);
    if (!listed) return 0;
    const expiries = this.expiriesOf(listed.contracts, now);
    for (const expiry of expiries) await this.fetchSnapshot(underlying, expiry, listed, now, signal);
    return expiries.length;
  }

  private expiriesOf(contracts: OptionContract[], now: number): string[] {
    return [...new Set(contracts.map(c => c.expiry).filter(e => e >= istDate(now)))].sort();
  }

  private async load(raw: string, wanted: string | undefined, asOf: number | undefined, signal: AbortSignal): Promise<Loaded | null> {
    const underlying = raw.replace(/^NSE:/i, '').toUpperCase();
    const now = asOf ?? this.env.now();
    const listed = await this.contracts.list(underlying, istDate(now), signal);
    if (!listed) throw new NotFoundError(`${underlying} has no listed options`);
    const expiries = this.expiriesOf(listed.contracts, now);
    const expiry = wanted ?? expiries[0];
    if (!expiry || !expiries.includes(expiry)) throw new ValidationError(`No ${underlying} expiry ${wanted ?? '(any)'}; listed: ${expiries.join(', ') || 'none'}`);
    const stored = await this.store.latest(underlying, expiry, now);
    const fresh = stored !== null && (asOf !== undefined || now - stored.takenAt < FRESH_MS);
    let snapshot = stored;
    if (!fresh && asOf === undefined) {
      try { snapshot = await this.fetchSnapshot(underlying, expiry, listed, now, signal); }
      catch (error) {
        if (!stored) throw error;
        this.env.warn?.('option quotes failed; serving the last snapshot', { underlying, expiry, error: error instanceof Error ? error.message : String(error) });
      }
    }
    if (!snapshot) return null;
    const earlier = await this.store.before(underlying, expiry, istMidnight(snapshot.takenAt));
    return { snapshot, expiries, expiry, baseline: new Map((earlier?.legs ?? []).flatMap(l => l.oi === null ? [] : [[l.symbol, l.oi] as const])) };
  }

  private async fetchSnapshot(underlying: string, expiry: string, listed: { spotSymbol: string; contracts: OptionContract[] }, now: number, signal: AbortSignal): Promise<OptionSnapshot> {
    const mine = listed.contracts.filter(c => c.expiry === expiry);
    const quoted = await this.quotes.quote([listed.spotSymbol, ...mine.map(c => c.symbol)], signal);
    const snapshot: OptionSnapshot = { underlying, expiry, takenAt: now, spot: quoted.get(listed.spotSymbol)?.ltp ?? null,
      legs: mine.map(c => ({ symbol: c.symbol, strike: c.strike, type: c.type, ltp: quoted.get(c.symbol)?.ltp ?? null, oi: quoted.get(c.symbol)?.oi ?? null, volume: quoted.get(c.symbol)?.volume ?? null })) };
    await this.store.save(snapshot);
    return snapshot;
  }
}
