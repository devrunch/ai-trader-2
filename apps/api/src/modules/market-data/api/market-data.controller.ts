import { Controller, Get, Inject, Param, Query, UseGuards } from '@nestjs/common';
import { MarketDataRateLimitGuard } from './market-data-rate-limit.guard';
import { GetQuote, MarketDataService } from '../application';
import { parseBarsQuery } from './market-data.dto';
import { ResolveInstrument } from '../../instruments/application/index';
import { ReadSeq } from '../application/read-seq';
import { z } from 'zod';
import { QUOTES_MAX } from '@aitrader/contracts';
import { DomainError } from '../../../shared/errors';

const SeqQuerySchema = z.object({ symbol: z.string().trim().min(3).max(80) });
const QuotesQuerySchema = z.object({ ids: z.string().transform(v => [...new Set(v.split(',').map(id => id.trim()).filter(Boolean))])
  .pipe(z.array(z.string().min(3).max(80)).min(1).max(QUOTES_MAX)) });

@Controller('v1')
@UseGuards(MarketDataRateLimitGuard)
export class MarketDataController {
  constructor(@Inject(MarketDataService) private readonly market: MarketDataService,
    @Inject(GetQuote) private readonly quote: GetQuote,
    @Inject(ResolveInstrument) private readonly resolve: ResolveInstrument,
    @Inject(ReadSeq) private readonly sequences: ReadSeq) {}

  @Get('bars')
  bars(@Query() raw: unknown) {
    const { symbol, interval, cursor, limit } = parseBarsQuery(raw);
    return this.market.bars(symbol, interval, cursor, limit);
  }

  @Get('quote/:id')
  quoteOf(@Param('id') id: string) {
    return this.quote.execute(id);
  }

  /** One request for a whole watchlist instead of one per row. */
  @Get('quotes')
  async quotes(@Query() raw: unknown) {
    const { ids } = QuotesQuerySchema.parse(raw);
    const settled = await Promise.allSettled(ids.map(id => this.quote.execute(id)));
    return { quotes: settled.map((result, i) => result.status === 'fulfilled' ? result.value
      : { instrumentId: ids[i] ?? '', error: result.reason instanceof DomainError ? result.reason.code : 'UNAVAILABLE' }) };
  }

  @Get('bars/seq')
  async barSeq(@Query() raw: unknown) {
    const { symbol } = SeqQuerySchema.parse(raw);
    const { instrument } = await this.resolve.execute(symbol);
    const instrumentId = instrument.id.toString();
    return { instrumentId, seq: await this.sequences.current(instrumentId) };
  }
}
