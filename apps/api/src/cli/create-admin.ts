import 'reflect-metadata';
import process from 'node:process';
import { NestFactory } from '@nestjs/core';
import { loadRuntimeConfig } from '../main.js';
import { CreateAdmin } from '../modules/auth/application/index.js';
import { validatePassword } from '../modules/auth/domain/password-policy.js';
import { AdminCliModule } from './admin-cli.module.js';
import { readHidden } from './hidden-prompt.js';

const usage = 'Usage: pnpm --filter @aitrader/api admin:create <username>';
const mismatch = 'Passwords do not match';
const shortPassword = 'Password must be at least 12 characters';
const invalidUsername = 'Invalid username';
const missingTty = 'A TTY is required to enter the password securely';
const genericFailure = 'Unable to create admin user. Check configuration and input.';

export interface CreateAdminDependencies {
  username: string | undefined;
  prompt(question: string): Promise<string>;
  output(message: string): void;
  create(username: string, password: string): Promise<void>;
}

function safeErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return genericFailure;
  if (error.message === usage || error.message === mismatch || error.message === shortPassword
    || error.message === invalidUsername || error.message === missingTty) return error.message;
  return genericFailure;
}

export async function runCreateAdmin(deps: CreateAdminDependencies): Promise<void> {
  try {
    if (!deps.username) throw new Error(usage);
    const password = await deps.prompt('Password: ');
    const confirmation = await deps.prompt('Confirm password: ');
    if (password !== confirmation) throw new Error(mismatch);
    validatePassword(password);
    await deps.create(deps.username, password);
    deps.output('Admin user created or reset.\n');
  } catch (error) {
    const message = safeErrorMessage(error);
    deps.output(`${message}\n`);
    throw new Error(message);
  }
}

async function run(): Promise<void> {
  await runCreateAdmin({
    username: process.argv[2],
    prompt: (question) => {
      if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error(missingTty);
      return readHidden(process.stdin, process.stdout, question);
    },
    output: (message) => { process.stdout.write(message); },
    create: async (username, password) => {
      const app = await NestFactory.createApplicationContext(AdminCliModule.forRoot(loadRuntimeConfig()), { logger: false });
      try { await app.get(CreateAdmin).execute(username, password); }
      finally { await app.close(); }
    },
  });
}

if (process.argv[1]?.endsWith('create-admin.js')) void run().catch(() => { process.exitCode = 1; });
