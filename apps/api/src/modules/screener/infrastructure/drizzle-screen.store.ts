import { ScreenSpecSchema } from '@aitrader/contracts';
import type { Database } from '../../../shared/database';
import { savedScreens } from '../../../shared/database/schema';
import { DrizzleSpecStore, savedSpecRow } from '../../../shared/saved-specs';
import type { ScreenStore, StoredScreen } from '../application/saved-screens';

const rowSchema = savedSpecRow.extend({ spec: ScreenSpecSchema });

export class DrizzleScreenStore extends DrizzleSpecStore<StoredScreen['spec'], StoredScreen> implements ScreenStore {
  constructor(db: Database) { super(db, savedScreens, row => rowSchema.parse(row)); }
}
