import { RELEASE_AFTER_MINUTES, RELEASE_BRIEF_MINUTES, RELEASE_INSTRUCTION, currenciesOf, releaseTaskTitle } from '../domain/release-plan';

interface ReleaseEvent { title: string; country: string; at: string }
export interface ReleaseInputs {
  /** The user's symbols: watchlist and the markets everyone follows. */
  symbols(userId: string): Promise<string[]>;
  /** High-impact releases in the next day. */
  events(): Promise<ReleaseEvent[]>;
}
export interface ReleaseTasks {
  titles(userId: string): Promise<string[]>;
  create(userId: string, input: { title: string; instruction: string; trigger: { kind: 'event'; countries: string[]; title: string; minImpact: 'High'; afterMinutes: number; briefMinutes: number };
    maxRuns: number; expiresInDays: number }): Promise<unknown>;
}

const LEAD_MS = (RELEASE_BRIEF_MINUTES + 5) * 60_000;
const HOURS_AFTER = 3;

/**
 * The assistant is more active around releases (owner decision): every high-impact release that moves the user's markets gets a task without being asked,
 * created early enough for the brief. Run hourly; a release that already has its task is skipped.
 */
export class ReleaseWatch {
  constructor(private readonly inputs: ReleaseInputs, private readonly tasks: ReleaseTasks, private readonly now: () => number) {}

  async planFor(userId: string): Promise<number> {
    const [symbols, events, titles] = await Promise.all([this.inputs.symbols(userId), this.inputs.events(), this.tasks.titles(userId)]);
    const currencies = new Set(currenciesOf(symbols));
    const now = this.now();
    let created = 0;
    for (const event of events) {
      const at = Date.parse(event.at);
      const title = releaseTaskTitle(event);
      if (!currencies.has(event.country) || at - now < LEAD_MS || titles.includes(title)) continue;
      await this.tasks.create(userId, { title, instruction: RELEASE_INSTRUCTION,
        trigger: { kind: 'event', countries: [event.country], title: event.title, minImpact: 'High', afterMinutes: RELEASE_AFTER_MINUTES, briefMinutes: RELEASE_BRIEF_MINUTES },
        maxRuns: 3, expiresInDays: (at - now + HOURS_AFTER * 3_600_000) / 86_400_000 });
      created++;
    }
    return created;
  }
}
