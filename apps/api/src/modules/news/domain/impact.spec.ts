import { describe, expect, it } from 'vitest';
import { assessImpact } from './impact';

const NIFTY = 'NSE:NIFTY';
const BANKNIFTY = 'NSE:BANKNIFTY';
const USDINR = 'FX:USDINR';
const GOLD = 'MCX:GOLD1!';
const CRUDE = 'MCX:CRUDEOIL1!';

describe('news impact', () => {
  it('rates RBI rate cuts high, up, moving rate-sensitive instruments', () => {
    expect(assessImpact('RBI cuts repo rate by 25 bps', [])).toEqual({ impact: 'high', moves: [NIFTY, BANKNIFTY, USDINR], direction: 'up' });
  });
  it('rates an unchanged RBI policy high with no direction', () => {
    expect(assessImpact('RBI keeps repo rate unchanged', [])).toEqual({ impact: 'high', moves: [NIFTY, BANKNIFTY, USDINR], direction: null });
  });
  it('rates a Fed hold high with no direction', () => {
    expect(assessImpact('Fed holds rates, Powell signals caution', [])).toEqual({ impact: 'high', moves: ['US stocks', GOLD, USDINR], direction: null });
  });
  it('rates a Fed hike high and down', () => {
    expect(assessImpact('Fed raises rates by 25 bps', [])).toEqual({ impact: 'high', moves: ['US stocks', GOLD, USDINR], direction: 'down' });
  });
  it('rates an ECB decision high and keeps the tagged instrument', () => {
    expect(assessImpact('ECB holds rates steady', ['FX:EURUSD'])).toEqual({ impact: 'high', moves: ['FX:EURUSD'], direction: null });
  });
  it('rates an RBI headline without a rate or policy word low', () => {
    expect(assessImpact('RBI appoints new deputy governor', [])).toEqual({ impact: 'low', moves: [], direction: null });
  });
  it('rates OPEC crude surges high and up without duplicating the tagged crude', () => {
    const expected = { impact: 'high', moves: [CRUDE], direction: 'up' };
    expect(assessImpact('Brent crude surges past $90 as OPEC+ extends cuts', [CRUDE])).toEqual(expected);
    expect(assessImpact('Brent crude surges past $90 as OPEC+ extends cuts', [])).toEqual(expected);
  });
  it('rates a tagged-company earnings beat medium', () => {
    expect(assessImpact('Reliance Q2 profit beats estimates', ['NSE:RELIANCE'])).toEqual({ impact: 'medium', moves: ['NSE:RELIANCE'], direction: null });
  });
  it('adds NIFTY to IT results', () => {
    expect(assessImpact('IT results: TCS beats estimates', ['NSE:TCS'])).toEqual({ impact: 'medium', moves: ['NSE:TCS', NIFTY], direction: null });
  });
  it('rates an index crash high and down', () => {
    expect(assessImpact('Sensex crashes 1,000 points', ['BSE:SENSEX'])).toEqual({ impact: 'high', moves: ['BSE:SENSEX'], direction: 'down' });
  });
  it('rates gold at a record high medium and up', () => {
    expect(assessImpact('Gold hits record high', [GOLD])).toEqual({ impact: 'medium', moves: [GOLD], direction: 'up' });
  });
  it('rates the rupee at a record low medium and down', () => {
    expect(assessImpact('Rupee falls to record low', [USDINR])).toEqual({ impact: 'medium', moves: [USDINR], direction: 'down' });
  });
  it('rates the Budget high and maps it to NIFTY', () => {
    expect(assessImpact('Union Budget 2027 raises capex outlay', [])).toEqual({ impact: 'high', moves: [NIFTY], direction: null });
  });
  it('rates CPI inflation prints high', () => {
    expect(assessImpact('India CPI inflation eases to 4.2%', [])).toEqual({ impact: 'high', moves: [NIFTY], direction: null });
  });
  it('rates GDP data high', () => {
    expect(assessImpact('India GDP growth slows to 6.1%', [])).toEqual({ impact: 'high', moves: [NIFTY], direction: null });
  });
  it('rates a SEBI ban high', () => {
    expect(assessImpact('SEBI bans promoter from market', [])).toEqual({ impact: 'high', moves: [], direction: null });
  });
  it('rates war headlines high with no direction rule', () => {
    expect(assessImpact('War escalates, oil prices jump', [CRUDE])).toEqual({ impact: 'high', moves: [CRUDE], direction: null });
  });
  it('rates an analyst upgrade of a tagged stock medium', () => {
    expect(assessImpact('Infosys upgraded to buy by Jefferies', ['NSE:INFY'])).toEqual({ impact: 'medium', moves: ['NSE:INFY'], direction: null });
  });
  it('rates FII flows medium even with no tagged instrument', () => {
    expect(assessImpact('FIIs sell Rs 3,000 crore of equities', [])).toEqual({ impact: 'medium', moves: [], direction: null });
  });
  it('rates unrelated headlines low', () => {
    expect(assessImpact('Local bakery opens new outlet in Pune', [])).toEqual({ impact: 'low', moves: [], direction: null });
  });
  it('does not match inside other words', () => {
    expect(assessImpact('Goldman Sachs and Federal Bank hold a seminar', [])).toEqual({ impact: 'low', moves: [], direction: null });
  });
  it('returns unclear when a high-impact headline has conflicting rules', () => {
    expect(assessImpact('Fed cuts rates but markets plunge', [])).toEqual({ impact: 'high', moves: ['US stocks', GOLD, USDINR], direction: 'unclear' });
  });
  it('returns null direction when a non-high headline has conflicting rules', () => {
    expect(assessImpact('Stocks surge then plunge', [])).toEqual({ impact: 'low', moves: [], direction: null });
  });
  it('caps moves at six, tagged instruments first', () => {
    const tagged = ['A:1', 'A:2', 'A:3', 'A:4', 'A:5'];
    expect(assessImpact('Fed holds rates', tagged).moves).toEqual(['A:1', 'A:2', 'A:3', 'A:4', 'A:5', 'US stocks']);
  });
});
