import { Controller, Get, Inject, Param, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { SessionGuard } from '../../auth/api/index';
import { NotFoundError, ValidationError } from '../../../shared/errors';
import { FundamentalsService } from '../application/fundamentals';

const QuerySchema = z.strictObject({ asOf: z.iso.datetime({ offset: true }).optional() });

@Controller('v1/fundamentals')
@UseGuards(SessionGuard)
export class FundamentalsController {
  constructor(@Inject(FundamentalsService) private readonly fundamentals: FundamentalsService) {}

  @Get(':symbol')
  async get(@Param('symbol') symbol: string, @Query() raw: unknown) {
    const query = QuerySchema.safeParse(raw);
    if (!query.success) throw new ValidationError('asOf must be an ISO date-time');
    const record = await this.fundamentals.get(symbol, query.data.asOf ? { asOf: Date.parse(query.data.asOf) } : {});
    if (!record) throw new NotFoundError('No fundamentals stored for this company at that time');
    return record;
  }
}
