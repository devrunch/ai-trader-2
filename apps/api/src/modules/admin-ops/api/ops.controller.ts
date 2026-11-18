import { Controller, Get, HttpCode, Inject, Param, Post, Query, UseGuards } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { type RecentLogsResponse } from '@aitrader/contracts';
import { REDIS } from '../../../shared/redis/index.js';
import { recentLogsResponse } from '../../../shared/observability/recent-logs.js';
import { OpsFeedsSchema, OpsInstrumentsSchema, OpsJobsSchema, type OpsFeeds, type OpsInstruments, type OpsJobs } from '@aitrader/contracts';
import { ConflictError, NotFoundError } from '../../../shared/errors/index.js';
import { CsrfHeaderGuard, Roles, RolesGuard, SessionGuard } from '../../auth/api/index.js';
import { DataSourcesResponseSchema, type DataSourcesResponse } from '@aitrader/contracts';
import { OpsSources } from '../application/ops-sources.js';
import { OpsOverview } from '../application/ops-overview.js';

@Controller('v1/admin/ops')
@UseGuards(SessionGuard, RolesGuard)
@Roles('admin')
export class OpsController {
  constructor(@Inject(OpsOverview) private readonly ops: OpsOverview, @Inject(OpsSources) private readonly sources: OpsSources, @Inject(REDIS) private readonly redis: Redis) {}

  @Get('sources')
  async dataSources(): Promise<DataSourcesResponse> { return DataSourcesResponseSchema.parse(await this.sources.list()); }

  @Get('feeds')
  async feeds(): Promise<OpsFeeds> { return OpsFeedsSchema.parse(await this.ops.feeds()); }

  @Get('jobs')
  async jobs(): Promise<OpsJobs> { return OpsJobsSchema.parse(await this.ops.jobs()); }

  @Post('jobs/:name/run') @HttpCode(202) @UseGuards(CsrfHeaderGuard)
  async runJob(@Param('name') name: string): Promise<void> {
    const result = await this.ops.runJob(name);
    if (result === 'unknown') throw new NotFoundError('Unknown job', { name });
    if (result === 'already-queued') throw new ConflictError('A run of this job is already queued; it starts when the current run ends');
  }

  @Get('logs')
  logs(@Query() raw: unknown): Promise<RecentLogsResponse> { return recentLogsResponse(this.redis, raw); }

  @Get('instruments')
  async instruments(): Promise<OpsInstruments> { return OpsInstrumentsSchema.parse(await this.ops.instruments()); }

  @Post('instruments/refresh') @HttpCode(202) @UseGuards(CsrfHeaderGuard)
  async refreshInstruments(): Promise<void> { await this.ops.refreshInstruments(); }
}
