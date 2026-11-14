import { AgentProfileSchema, type AgentKnowledge, type AgentProfile, type LearnedItem } from '@aitrader/contracts';
import { NotFoundError, ValidationError } from '../../../shared/errors';
import { describeProfile, mergeProfile, summarizeSignals, topicOf } from '../domain/profile';
import type { AgentMemory } from './agent-memory';

export interface ProfileStore { get(userId: string): Promise<AgentProfile>; set(userId: string, profile: AgentProfile): Promise<void> }
export interface SignalInput { eventKey: string; kind: string; topic: string; tools: string[] }
export interface SignalStore {
  /** False when the same event was already recorded. */
  record(userId: string, id: string, signal: SignalInput): Promise<boolean>;
  list(userId: string): Promise<LearnedItem[]>;
  remove(userId: string, id: string | null): Promise<number>;
  /** The tools used by the user's n-th turn in a thread, oldest first; null when there is no such turn. */
  turnTools(userId: string, threadId: string, index: number): Promise<string[] | null>;
}

/**
 * What the assistant knows about the user: stated and edited preferences, remembered notes and what worked before.
 * The user reads and deletes all of it; `promptFor` is the one compact block the assistant sees each turn.
 */
export class AgentProfileService {
  constructor(private readonly profiles: ProfileStore, private readonly signals: SignalStore, private readonly memory: AgentMemory,
    private readonly env: { id: () => string }, private readonly groupOf: (tool: string) => string | undefined) {}

  get(userId: string): Promise<AgentProfile> { return this.profiles.get(userId); }

  /** `patch` fields replace stored ones; null removes a field. */
  async update(userId: string, patch: Record<string, unknown>): Promise<AgentProfile> {
    const merged = AgentProfileSchema.safeParse(mergeProfile(await this.profiles.get(userId), patch));
    if (!merged.success) throw new ValidationError('That profile value is not valid', { issues: merged.error.issues.map(i => `${i.path.join('.')}: ${i.message}`) });
    await this.profiles.set(userId, merged.data);
    return merged.data;
  }

  replace(userId: string, profile: AgentProfile): Promise<AgentProfile> {
    return this.update(userId, Object.fromEntries(Object.keys(AgentProfileSchema.shape).map(k => [k, (profile as Record<string, unknown>)[k] ?? null])));
  }

  /** Recorded once per `eventKey`; a repeat is ignored. Never throws into the caller's main action. */
  async signal(userId: string, input: SignalInput): Promise<void> {
    await this.signals.record(userId, this.env.id(), input).catch(() => false);
  }

  async thumbs(userId: string, threadId: string, turnIndex: number, value: 'up' | 'down'): Promise<void> {
    const tools = await this.signals.turnTools(userId, threadId, turnIndex);
    if (tools === null) throw new NotFoundError('That reply was not found', { threadId, turnIndex });
    await this.signals.record(userId, this.env.id(), { eventKey: `thumb:${threadId}:${String(turnIndex)}`, kind: `thumb-${value}`, topic: topicOf(tools, this.groupOf), tools });
  }

  /** One item, or everything learned from behaviour when `id` is null. */
  async forgetLearned(userId: string, id: string | null): Promise<void> {
    if ((await this.signals.remove(userId, id)) === 0 && id !== null) throw new NotFoundError('Learned item not found', { id });
  }

  async knowledge(userId: string): Promise<AgentKnowledge> {
    const [profile, notes, learned] = await Promise.all([this.profiles.get(userId), this.memory.list(userId), this.signals.list(userId)]);
    return { profile, notes, learned, summary: summarizeSignals(learned) };
  }

  /** Profile, notes and what works, in one block; empty when nothing is known. */
  async promptFor(userId: string): Promise<string> {
    const [profile, notes, learned] = await Promise.all([this.profiles.get(userId).catch(() => ({})), this.memory.promptFor(userId), this.signals.list(userId).catch(() => [])]);
    const described = describeProfile(profile);
    const works = summarizeSignals(learned);
    const parts = [
      described && `## About this user\nAdapt length and format to this. Update it with updateProfile when they state a preference.\n${described}`,
      notes.trim(),
      works && `## What works for this user\nFrom answers they accepted or rejected.\n${works}`,
    ].filter(Boolean);
    return parts.length ? `\n\n${parts.join('\n\n')}` : '';
  }
}
