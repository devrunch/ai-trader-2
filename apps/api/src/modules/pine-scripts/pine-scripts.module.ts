import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import { DB, type Database } from '../../shared/database';
import { AuthModule } from '../auth/auth.module';
import { PineScriptsController } from './api/pine-scripts.controller';
import { PineScripts } from './application/pine-scripts';
import { DrizzlePineScriptStore } from './infrastructure/drizzle-pine-script.store';

@Module({
  imports: [AuthModule],
  controllers: [PineScriptsController],
  providers: [{ provide: PineScripts, inject: [DB], useFactory: (db: Database) => new PineScripts(new DrizzlePineScriptStore(db), { id: randomUUID, now: () => new Date() }) }],
})
export class PineScriptsModule {}
