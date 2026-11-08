import { expect, it } from 'vitest';
import { InstrumentSummarySchema, InstrumentSchema, InstrumentSearchResponseSchema, ResolvedInstrumentResponseSchema } from './instrument.js';

// FR-SY-6, FR-SY-7, SRD ?11
it('schemas reject unknown keys and types', () => {
  const summary = { id: 'NSE:NIFTY', description: 'Nifty 50', exchange: 'NSE', type: 'index', currency: 'INR', status: 'active' };
  expect(InstrumentSummarySchema.parse(summary)).toEqual(summary);
  expect(InstrumentSummarySchema.safeParse({ ...summary, extra: true }).success).toBe(false);
  expect(InstrumentSummarySchema.safeParse({ ...summary, type: 'crypto' }).success).toBe(false);
  const full = { ...summary, ticker: 'NIFTY', timezone: 'Asia/Kolkata', session: '0915-1530', pricescale: 100, minmov: 1, lotSize: 1, hasIntraday: true, volumeType: 'real', aliases: [] };
  expect(InstrumentSchema.safeParse(full).success).toBe(true);
  for (const schema of [InstrumentSchema, InstrumentSearchResponseSchema, ResolvedInstrumentResponseSchema]) {
    expect(schema.safeParse({ ...full, extra: true }).success).toBe(false);
  }
  expect(InstrumentSearchResponseSchema.safeParse({ query: '', results: [summary], extra: 1 }).success).toBe(false);
  expect(ResolvedInstrumentResponseSchema.safeParse({ instrument: full, extra: 1 }).success).toBe(false);
});
