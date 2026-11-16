import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { DataGapsResponseSchema, type DataGapsResponse } from '@aitrader/contracts';
import { Roles, RolesGuard, SessionGuard } from '../../auth/api/index.js';
import { OpsTokenGuard } from '../../../shared/ops/index.js';
import { DataGaps } from '../application/data-gaps';

/** Admin: what the assistant looked for and could not get. */
@Controller('v1/admin/data-gaps')
@UseGuards(SessionGuard, RolesGuard)
@Roles('admin')
export class DataGapsController {
  constructor(@Inject(DataGaps) private readonly gaps: DataGaps) {}

  @Get()
  async list(): Promise<DataGapsResponse> { return DataGapsResponseSchema.parse({ gaps: await this.gaps.list() }); }
}

/** The same list for the operator's tooling, behind OPS_READ_TOKEN. */
@Controller('v1/ops/data-gaps')
@UseGuards(OpsTokenGuard)
export class OpsDataGapsController {
  constructor(@Inject(DataGaps) private readonly gaps: DataGaps) {}

  @Get()
  async list(): Promise<DataGapsResponse> { return DataGapsResponseSchema.parse({ gaps: await this.gaps.list() }); }
}
