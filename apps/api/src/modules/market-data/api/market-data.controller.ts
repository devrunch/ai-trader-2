import { Controller, Get, Inject, Param, Query, UseGuards } from '@nestjs/common';
import { MarketDataRateLimitGuard } from './market-data-rate-limit.guard';
import { GetQuote, MarketDataService } from '../application';
import { parseBarsQuery } from './market-data.dto';

@Controller('v1')
@UseGuards(MarketDataRateLimitGuard)
export class MarketDataController {
  constructor(@Inject(MarketDataService) private readonly market: MarketDataService,
    @Inject(GetQuote) private readonly quote: GetQuote) {}

  @Get('bars')
  bars(@Query() raw: unknown) {
    const { symbol, interval, cursor, limit } = parseBarsQuery(raw);
    return this.market.bars(symbol, interval, cursor, limit);
  }

  @Get('quote/:id')
  quoteOf(@Param('id') id: string) {
    return this.quote.execute(id);
  }
}
