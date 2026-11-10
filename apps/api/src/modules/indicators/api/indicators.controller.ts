import { Body, Controller, Get, HttpCode, Inject, Param, Post, UseGuards } from '@nestjs/common';
import { IndicatorComputeRequestSchema, type IndicatorResult } from '@aitrader/contracts';
import { IndicatorService } from '../application';
import { IndicatorsRateLimitGuard } from './indicators-rate-limit.guard';

/** FR-IN-31: one set of endpoints for every runtime; the runtime used never appears in a response. */
@Controller('v1/indicators')
@UseGuards(IndicatorsRateLimitGuard)
export class IndicatorsController {
  constructor(@Inject(IndicatorService) private readonly indicators: IndicatorService) {}

  @Get()
  list(): { indicators: ReturnType<IndicatorService['list']> } {
    return { indicators: this.indicators.list() };
  }

  @Get(':ref')
  detail(@Param('ref') ref: string): { definition: ReturnType<IndicatorService['get']>; pine: string } {
    return { definition: this.indicators.get(ref), pine: this.indicators.source(ref) };
  }

  @Post('compute')
  @HttpCode(200)
  compute(@Body() body: unknown): Promise<IndicatorResult> {
    return this.indicators.compute(IndicatorComputeRequestSchema.parse(body));
  }
}
