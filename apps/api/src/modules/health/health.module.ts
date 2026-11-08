import { Module } from '@nestjs/common';
import { ReadinessModule } from '../../shared/health';
import { HealthController } from './api/health.controller';

@Module({ imports: [ReadinessModule], controllers: [HealthController] })
export class HealthModule {}
