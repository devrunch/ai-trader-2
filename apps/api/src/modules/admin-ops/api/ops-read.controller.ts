import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { OpsJobsSchema, type OpsJobs, type RecentLogsResponse, DataSourcesResponseSchema, type DataSourcesResponse } from '@aitrader/contracts';
import { OpsTokenGuard } from '../../../shared/ops/index.js';
import { REDIS } from '../../../shared/redis/index.js';
import { recentLogsResponse } from '../../../shared/observability/recent-logs.js';
import { OpsOverview } from '../application/ops-overview.js';
import { OpsSources } from '../application/ops-sources.js';

/** The operator's read-only view from outside the app (jobs with their last error, recent warning and error lines, data sources), behind OPS_READ_TOKEN. */
@Controller('v1/ops')
@UseGuards(OpsTokenGuard)
export class OpsReadController {
  constructor(@Inject(OpsOverview) private readonly ops: OpsOverview, @Inject(OpsSources) private readonly sources: OpsSources, @Inject(REDIS) private readonly redis: Redis) {}

  @Get('jobs')
  async jobs(): Promise<OpsJobs> { return OpsJobsSchema.parse(await this.ops.jobs()); }

  @Get('logs')
  logs(@Query() raw: unknown): Promise<RecentLogsResponse> { return recentLogsResponse(this.redis, raw); }

  @Get('sources')
  async dataSources(): Promise<DataSourcesResponse> { return DataSourcesResponseSchema.parse(await this.sources.list()); }
}
