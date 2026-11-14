import { z } from 'zod';
import { DomainError } from '../../../shared/errors';

/**
 * Some models send a nested object as a JSON string ("{\"kind\": ...}"). Accept both shapes for nested fields;
 * the object form stays first so it is what the model is shown.
 */
export function orJsonString<T extends z.ZodType>(schema: T) {
  return z.union([schema, z.string().transform((text, ctx) => {
    try { return JSON.parse(text) as unknown; } catch { ctx.addIssue({ code: 'custom', message: 'expected an object, got text that is not JSON' }); return z.NEVER; }
  }).pipe(schema)]);
}

/** An ok answer that says it has nothing (`available: false`), with its reason. */
function noData(data: unknown): string | null {
  if (typeof data !== 'object' || data === null || !('available' in data) || data.available !== false) return null;
  return 'reason' in data && typeof data.reason === 'string' ? data.reason : 'no data';
}

export interface ToolContext { userId: string; conversationId: string; turnId: string }
type ToolResult<T> = { ok: true; data: T } | { ok: false; reason: string; detail?: string };
interface ToolAudit {
  userId: string; conversationId: string; turnId: string; tool: string; args: unknown; outcome: string; ms: number;
  /** Why it failed, or why an ok answer carried no data (`NO_DATA`). */
  detail?: string | undefined;
}
export interface GuardDeps {
  limiter: { take(key: string): Promise<boolean> };
  audit: (entry: ToolAudit) => void;
  clock?: () => number;
}
export interface GuardedTool<I, O> {
  readonly name: string;
  readonly description: string;
  readonly input: z.ZodType<I>;
  call(ctx: ToolContext, raw: unknown): Promise<ToolResult<O>>;
}

/**
 * The only way the agent reads data (FR-AG-5): schema-validated input, a per-user and per-conversation rate limit,
 * an audit entry per call, and a typed reason instead of a throw. Read-only by construction: there is no write variant.
 */
export function guardedTool<I, O>(spec: { name: string; description: string; input: z.ZodType<I>; run(input: I, ctx: ToolContext): Promise<O> },
  deps: GuardDeps): GuardedTool<I, O> {
  const clock = deps.clock ?? Date.now;
  return {
    name: spec.name, description: spec.description, input: spec.input,
    async call(ctx, raw) {
      const started = clock();
      const finish = (result: ToolResult<O>): ToolResult<O> => {
        const empty = result.ok ? noData(result.data) : null;
        deps.audit({ ...ctx, tool: spec.name, args: raw, outcome: result.ok ? (empty === null ? 'ok' : 'NO_DATA') : result.reason, ms: clock() - started,
          detail: result.ok ? empty ?? undefined : result.detail });
        return result;
      };
      const parsed = spec.input.safeParse(raw);
      if (!parsed.success) return finish({ ok: false, reason: 'INVALID_INPUT', detail: parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ') });
      const [perUser, perConversation] = await Promise.all([
        deps.limiter.take(`agent:${spec.name}:user:${ctx.userId}`), deps.limiter.take(`agent:conversation:${ctx.conversationId}`),
      ]);
      if (!perUser || !perConversation) return finish({ ok: false, reason: 'RATE_LIMITED' });
      try { return finish({ ok: true, data: await spec.run(parsed.data, ctx) }); }
      catch (error) {
        if (error instanceof DomainError) return finish({ ok: false, reason: error.code, detail: error.message });
        return finish({ ok: false, reason: 'UNAVAILABLE' });
      }
    },
  };
}
