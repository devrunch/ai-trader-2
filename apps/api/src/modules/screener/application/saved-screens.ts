import { SCREEN_LIMITS, type SavedScreen, type ScreenSpec } from '@aitrader/contracts';
import { SavedSpecs, type SpecEnv, type SpecStore, type StoredSpec } from '../../../shared/saved-specs';

export type StoredScreen = StoredSpec<ScreenSpec>;
export type ScreenStore = SpecStore<ScreenSpec, StoredScreen>;

const dto = ({ id, name, spec, createdAt, updatedAt }: StoredScreen): SavedScreen => ({ id, name, spec, createdAt, updatedAt });

/** A user's saved screens, capped per user and isolated by owner. */
export class SavedScreens extends SavedSpecs<ScreenSpec, StoredScreen, SavedScreen> {
  constructor(store: ScreenStore, env: SpecEnv) {
    super(store, env, { limit: SCREEN_LIMITS.perUser, plural: 'screens', singular: 'Screen', toDto: dto, newRow: base => base });
  }
}
