import { Controller, Get, Inject, Param, Query, UseGuards } from '@nestjs/common';
import { ResolveInstrument, SearchInstruments } from '../application/index.js';
import { parseSearchQuery, resolvedResponse } from './instrument.dto.js';
import { InstrumentsRateLimitGuard } from './instruments-rate-limit.guard.js';

@Controller('v1/instruments')
@UseGuards(InstrumentsRateLimitGuard)
export class InstrumentsController {
  constructor(@Inject(SearchInstruments) private readonly search: SearchInstruments,
    @Inject(ResolveInstrument) private readonly resolve: ResolveInstrument) {}

  @Get('search')
  searchInstruments(@Query() raw: unknown) {
    const { q, limit, exchange, type } = parseSearchQuery(raw);
    return this.search.execute(q, { limit, ...(exchange === undefined ? {} : { exchange }), ...(type === undefined ? {} : { type }) });
  }

  @Get(':id')
  async resolveInstrument(@Param('id') id: string) {
    return resolvedResponse(await this.resolve.execute(id));
  }
}
