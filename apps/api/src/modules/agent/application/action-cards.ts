import type { ActionCardDto, AgentAction, Drawing, DrawingIntent, IndicatorDefinition, PineCheck } from '@aitrader/contracts';
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

const dto = (card: ActionCard): ActionCardDto => ({ id: card.id, action: card.action, state: card.state, reason: card.reason,
  expiresAt: new Date(card.expiresAt).toISOString(), drawing: card.drawing });

export interface CardDeps {
  indicators: () => IndicatorDefinition[]; draw: (intent: DrawingIntent) => Promise<Drawing>;
  /** The Pine runtime's description of a script, or the error line; never throws for a bad script. */
  checkPine: (source: string) => Promise<PineCheck>;
  /** Saves to My scripts; returns the script id. */
  savePine: (userId: string, name: string, source: string) => Promise<string>;
  /** Risk-checks and places a confirmed proposed order (paper) and journals it; returns its client order id. */
  submitOrder: (userId: string, action: Extract<AgentAction, { kind: 'place-order' }>) => Promise<string>;
}

/** Proposed workspace changes the user confirms (FR-AG-17): pending, applied, dismissed, expired (15 min) or failed. */
export class ActionCards {
  constructor(private readonly store: ActionCardStore, private readonly deps: CardDeps,
    private readonly env: { now: () => number; id: () => string }) {}

  async propose(userId: string, action: AgentAction): Promise<ActionCardDto> {
    const problem = checkAction(action, this.deps.indicators());
    if (problem) throw new ValidationError(problem);
    // A drawing is computed now as a preview, so the assistant can describe real levels, and again on apply from fresh bars.
    const drawing = action.kind === 'draw' ? await this.deps.draw(action.intent) : null;
    const now = this.env.now();
    const card: ActionCard = { id: this.env.id(), userId, action, state: 'pending', reason: null, createdAt: now, expiresAt: now + CARD_TTL_MS, drawing };
    await this.store.create(card);
    return dto(card);
  }

  /** Validates the script first, so a broken one still gets a card that shows the error and cannot be applied. */
  async proposePine(userId: string, input: { name?: string | undefined; source: string }): Promise<ActionCardDto> {
    const check = await this.deps.checkPine(input.source);
    return this.propose(userId, { kind: 'add-pine', name: input.name ?? (check.ok ? check.definition.name : 'Shared script'), source: input.source, check, scriptId: null });
  }

  async get(userId: string, id: string): Promise<ActionCardDto> {
    return dto(viewCard(await this.load(userId, id), this.env.now()));
  }

  async apply(userId: string, id: string, edited?: AgentAction): Promise<ActionCardDto> {
    if (edited) {
      const problem = checkAction(edited, this.deps.indicators());
      if (problem) throw new ValidationError(problem);
    }
    const stored = await this.load(userId, id);
    const decision = applyCard(stored, this.env.now(), edited?.kind === 'add-pine' || edited?.kind === 'place-order' ? undefined : edited);
    if (!decision.ok) throw new ConflictError(`This card can no longer be applied (${decision.reason.toLowerCase().replace('_', ' ')})`, { reason: decision.reason });
    if (decision.card === stored) return dto(stored);
    const applied = await this.settle(userId, decision.card);
    await this.commit(applied, stored.state);
    return dto(applied);
  }

  /** Work done at the moment of consent: a drawing is recomputed from fresh bars, a Pine script is re-checked and saved to My scripts. */
  private async settle(userId: string, card: ActionCard): Promise<ActionCard> {
    const { action } = card;
    if (action.kind === 'draw') return { ...card, drawing: await this.deps.draw(action.intent) };
    if (action.kind === 'place-order') return { ...card, action: { ...action, clientOrderId: await this.deps.submitOrder(userId, action) } };
    if (action.kind !== 'add-pine') return card;
    // Only the stored name and source count; an edited copy from the client is not trusted with the script.
    const check = await this.deps.checkPine(action.source);
    if (!check.ok) throw new ValidationError(`The script no longer passes the check: ${check.error}`);
    const scriptId = await this.deps.savePine(userId, action.name, action.source);
    return { ...card, action: { ...action, check, scriptId } };
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
