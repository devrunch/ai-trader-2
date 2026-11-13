import type { EventSpec } from '@aitrader/contracts';

/** What each recurring release measures and which side of the forecast is good for its currency. */
export interface EventSpecLookup { lookup(country: string, title: string): EventSpec | null }
