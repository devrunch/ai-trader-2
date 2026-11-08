import { InvalidInstrumentIdError } from './errors.js';

export class InstrumentId {
  private constructor(readonly exchange: string, readonly ticker: string) {}

  static parse(raw: string): InstrumentId {
    const value = raw.trim();
    const separator = value.indexOf(':');
    if (separator <= 0 || separator === value.length - 1) {
      throw new InvalidInstrumentIdError(raw, 'Exchange and ticker must be non-empty and separated by a colon');
    }
    const exchange = value.slice(0, separator).toUpperCase();
    if (!/^[A-Z0-9_]{1,20}$/.test(exchange)) {
      throw new InvalidInstrumentIdError(raw, 'Exchange must contain 1-20 letters, digits or underscores');
    }
    const ticker = /[A-Z]/.test(value) ? value.slice(separator + 1) : value.slice(separator + 1).toUpperCase();
    if (ticker.length > 64 || /[\u0000-\u001f\u007f]/.test(ticker)) {
      throw new InvalidInstrumentIdError(raw, 'Ticker must contain 1-64 characters without control characters');
    }
    return new InstrumentId(exchange, ticker);
  }

  static tryParse(raw: string): InstrumentId | null {
    try {
      return InstrumentId.parse(raw);
    } catch (error) {
      if (error instanceof InvalidInstrumentIdError) return null;
      throw error;
    }
  }

  toString(): string {
    return `${this.exchange}:${this.ticker}`;
  }

  equals(other: InstrumentId): boolean {
    return this.exchange === other.exchange && this.ticker === other.ticker;
  }
}
