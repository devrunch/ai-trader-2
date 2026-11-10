import type { ActionCardDto, AgentAction, IndicatorDefinition } from '@aitrader/contracts';
import { ConflictError, NotFoundError, ValidationError } from '../../../shared/errors';
import { applyCard, CARD_TTL_MS, dismissCard, failCard, viewCard, type ActionCard } from '../domain/action-card';

export interface ActionCardStore {
  create(card: ActionCard): Promise<void>;
  get(userId: string, id: string): Promise<ActionCard | null>;
  /** Writes only if the stored state is still `from`; false means someone changed it meanwhile. */
  save(card: ActionCard, from: ActionCard['state']): Promise<boolean>;
}

/** Checks a proposed action against what exists (an indicator id and its inputs). Returns a reason, or null when valid. */
function checkAction(action: AgentAction, indicators: IndicatorDefinition[]): string | null {
  if (action.kind !== 'add-indicator') return null;
  const def = indicators.find(d => d.id === action.indicatorId);
  if (!def) return `Unknown indicator "${action.indicatorId}"`;
  for (const [key, value] of Object.entries(action.inputs)) {
    const input = def.inputs.find(i => i.id === key);
    if (!input) return `${def.shortName} has no input "${key}"`;
    const expected = input.type === 'int' || input.type === 'float' ? 'number' : input.type === 'bool' ? 'boolean' : 'string';
    if (typeof value !== expected) return `${def.shortName} input "${key}" must be a ${expected}`;
    if (input.type === 'int' && !Number.isInteger(value)) return `${def.shortName} input "${key}" must be a whole number`;
    if ((input.type === 'int' || input.type === 'float') && typeof value === 'number'
      && ((input.min !== undefined && value < input.min) || (input.max !== undefined && value > input.max))) {
      return `${def.shortName} input "${key}" is out of range`;
    }
    if (input.type === 'string' && !input.options.includes(String(value))) return `${def.shortName} input "${key}" must be one of ${input.options.join(', ')}`;
  }
  return null;
}

const dto = (card: ActionCard): ActionCardDto => ({ id: card.id, action: card.action, state: card.state, reason: card.reason, expiresAt: new Date(card.expiresAt).toISOString() });

/** Proposed workspace changes the user confirms (FR-AG-17): pending, applied, dismissed, expired (15 min) or failed. */
export class ActionCards {
  constructor(private readonly store: ActionCardStore, private readonly indicators: () => IndicatorDefinition[],
    private readonly env: { now: () => number; id: () => string }) {}

  async propose(userId: string, action: AgentAction): Promise<ActionCardDto> {
    const problem = checkAction(action, this.indicators());
    if (problem) throw new ValidationError(problem);
    const now = this.env.now();
    const card: ActionCard = { id: this.env.id(), userId, action, state: 'pending', reason: null, createdAt: now, expiresAt: now + CARD_TTL_MS };
    await this.store.create(card);
    return dto(card);
  }

  async get(userId: string, id: string): Promise<ActionCardDto> {
    return dto(viewCard(await this.load(userId, id), this.env.now()));
  }

  async apply(userId: string, id: string, edited?: AgentAction): Promise<ActionCardDto> {
    if (edited) {
      const problem = checkAction(edited, this.indicators());
      if (problem) throw new ValidationError(problem);
    }
    const stored = await this.load(userId, id);
    const decision = applyCard(stored, this.env.now(), edited);
    if (!decision.ok) throw new ConflictError(`This card can no longer be applied (${decision.reason.toLowerCase().replace('_', ' ')})`, { reason: decision.reason });
    if (decision.card !== stored) await this.commit(decision.card, stored.state);
    return dto(decision.card);
  }

  async dismiss(userId: string, id: string): Promise<ActionCardDto> {
    const stored = await this.load(userId, id);
    const decision = dismissCard(stored, this.env.now());
    if (!decision.ok) throw new ConflictError(`This card can no longer be dismissed (${decision.reason.toLowerCase()})`, { reason: decision.reason });
    if (decision.card !== stored) await this.commit(decision.card, stored.state);
    return dto(decision.card);
  }

  async fail(userId: string, id: string, reason: string): Promise<ActionCardDto> {
    const stored = await this.load(userId, id);
    if (stored.state !== 'applied') throw new ConflictError('Only an applied card can be marked failed', { state: stored.state });
    const failed = failCard(stored, reason);
    await this.commit(failed, stored.state);
    return dto(failed);
  }

  private async commit(card: ActionCard, from: ActionCard['state']): Promise<void> {
    if (!(await this.store.save(card, from))) throw new ConflictError('This card changed meanwhile; reload it', { id: card.id });
  }

  private async load(userId: string, id: string): Promise<ActionCard> {
    const card = await this.store.get(userId, id);
    if (!card) throw new NotFoundError('Action card not found', { id });
    return card;
  }
}
