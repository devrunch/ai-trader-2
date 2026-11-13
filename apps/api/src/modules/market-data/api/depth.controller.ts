import { Controller, Get, Inject, Param, UseGuards } from '@nestjs/common';
import type { DepthResponse } from '@aitrader/contracts';
import { z } from 'zod';
import { SessionGuard } from '../../auth/api/index';
import { ResolveInstrument } from '../../instruments/application/index';
import { ReadDepth } from '../application/read-depth';
import { MarketDataRateLimitGuard } from './market-data-rate-limit.guard';

const IdSchema = z.string().trim().min(3).max(80);

@Controller('v1')
@UseGuards(MarketDataRateLimitGuard, SessionGuard)
export class DepthController {
  constructor(@Inject(ReadDepth) private readonly depth: ReadDepth, @Inject(ResolveInstrument) private readonly resolve: ResolveInstrument) {}

  /** The latest order book, or why there is none. The id goes through the same resolution as bars, so aliases and unknown ids behave alike. */
  @Get('depth/:id')
  async depthOf(@Param('id') id: string): Promise<DepthResponse> {
    const { instrument } = await this.resolve.execute(IdSchema.parse(id));
    return this.depth.execute(instrument.id.toString());
  }
}
