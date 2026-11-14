import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { DataGapsResponseSchema, type DataGapsResponse } from '@aitrader/contracts';
import { Roles, RolesGuard, SessionGuard } from '../../auth/api/index.js';
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
