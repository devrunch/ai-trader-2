import { Controller, Get, Inject, Param, Query, UseGuards } from '@nestjs/common';
import { OptionChainQuerySchema } from '@aitrader/contracts';
import { z } from 'zod';
import { SessionGuard } from '../../auth/api/index';
import { NotFoundError, ValidationError } from '../../../shared/errors';
import { OptionsService } from '../application/options';

const SummaryQuery = z.strictObject({ expiry: z.iso.date().optional() });
const TICKER = /^[A-Za-z0-9&-]{1,20}$/;

@Controller('v1/options')
@UseGuards(SessionGuard)
export class OptionsController {
  constructor(@Inject(OptionsService) private readonly options: OptionsService) {}

  @Get(':underlying/chain')
  async chain(@Param('underlying') underlying: string, @Query() raw: unknown) {
    const query = OptionChainQuerySchema.safeParse(raw);
    if (!query.success || !TICKER.test(underlying)) throw new ValidationError('expiry must be YYYY-MM-DD and strikes 1 to 30');
    return this.orMissing(await this.options.chain(underlying, query.data, new AbortController().signal), underlying);
  }

  @Get(':underlying/summary')
  async summary(@Param('underlying') underlying: string, @Query() raw: unknown) {
    const query = SummaryQuery.safeParse(raw);
    if (!query.success || !TICKER.test(underlying)) throw new ValidationError('expiry must be YYYY-MM-DD');
    return this.orMissing(await this.options.summary(underlying, query.data, new AbortController().signal), underlying);
  }

  private orMissing<T>(value: T | null, underlying: string): T {
    if (value === null) throw new NotFoundError(`No option snapshot for ${underlying}`);
    return value;
  }
}
