import { Module } from '@nestjs/common';
import { DB, type Database } from '../../shared/database';
import { AuthModule } from '../auth/auth.module';
import { PromptsController } from './api/prompts.controller';
import { PromptRegistry } from './application/prompt-registry';
import { DrizzlePromptStore } from './infrastructure/drizzle-prompt.store';
import { FilePromptDefaults } from './infrastructure/file-prompt.defaults';

@Module({
  imports: [AuthModule],
  controllers: [PromptsController],
  providers: [
    { provide: PromptRegistry, inject: [DB], useFactory: (db: Database) => new PromptRegistry(new DrizzlePromptStore(db), new FilePromptDefaults()) },
  ],
  exports: [PromptRegistry],
})
export class AgentModule {}
