import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { NewsQuerySchema } from '@aitrader/contracts';
import { SessionGuard } from '../../auth/api/index';
import { NewsService } from '../application/news';

/** Recent market headlines, optionally only those that mention one instrument. */
@Controller('v1/news')
@UseGuards(SessionGuard)
export class NewsController {
  constructor(@Inject(NewsService) private readonly news: NewsService) {}

  @Get()
  async list(@Query() raw: unknown) {
    const { symbol, hours, limit, minImpact } = NewsQuerySchema.parse(raw);
    return { items: await this.news.list({ symbol, minImpact, hours, limit }) };
  }
}
