import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { Roles, RolesGuard, SessionGuard } from '../../auth/api/index';
import { RUN_QUEUE, type RunQueue } from '../application/run-queue';

/** Admin: how the assistant's background run queue is doing. */
@Controller('v1/admin/ops/agent-queue')
@UseGuards(SessionGuard, RolesGuard)
@Roles('admin')
export class AgentQueueController {
  constructor(@Inject(RUN_QUEUE) private readonly queue: RunQueue) {}

  @Get()
  stats() { return this.queue.stats(); }
}
