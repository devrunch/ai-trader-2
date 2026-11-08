import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql', schema: './src/shared/database/schema/index.ts', out: './drizzle',
  // Development migrations target docker-compose.dev.yml; environment reads stay in main.ts (R-9).
  dbCredentials: { url: 'postgresql://aitrader:aitrader@localhost:5432/aitrader' },
});
