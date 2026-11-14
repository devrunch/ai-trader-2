import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { NewsQuerySchema, SentimentQuerySchema } from '@aitrader/contracts';
import { SessionGuard } from '../../auth/api/index';
import { NewsService } from '../application/news';

/** Recent market headlines (flat or grouped into stories), and the sentiment trend of a symbol or market. */
@Controller('v1/news')
@UseGuards(SessionGuard)
export class NewsController {
  constructor(@Inject(NewsService) private readonly news: NewsService) {}

  @Get()
  async list(@Query() raw: unknown) {
    const { symbol, hours, limit, minImpact, market, crowd, clustered } = NewsQuerySchema.parse(raw);
    const query = { symbol, market, crowd, minImpact, hours, limit };
    return clustered ? { items: [], clusters: await this.news.clusters(query) } : { items: await this.news.list(query) };
  }

  @Get('sentiment')
  sentiment(@Query() raw: unknown) { return this.news.sentiment(SentimentQuerySchema.parse(raw)); }
}
