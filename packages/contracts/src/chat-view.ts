import { z } from 'zod';
import { INTERVALS } from './market-data.js';

const SymbolId = z.string().regex(/^[A-Z0-9_]+:[A-Z0-9_&.!-]+$/);
const Tone = z.enum(['up', 'down', 'neutral', 'warning']).optional();
const Text = z.string().trim().max(400);

/** What a button in a reply may do. Only these: each runs through the app's own checks, so nothing in a reply can do anything else. */
export const ViewActionSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('open-symbol'), symbol: SymbolId, interval: z.enum(INTERVALS).optional() }),
  z.strictObject({ type: z.literal('set-alert'), symbol: SymbolId, op: z.enum(['above', 'below']), value: z.number().positive() }),
  /** Sends this text as the user's next message (a follow-up question or "place it"). */
  z.strictObject({ type: z.literal('ask'), text: z.string().trim().min(2).max(300) }),
]);
export type ViewAction = z.infer<typeof ViewActionSchema>;

/** The blocks a reply can be built from. */
export const ViewBlockSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('heading'), text: Text }),
  z.strictObject({ kind: z.literal('text'), markdown: z.string().trim().max(2000) }),
  z.strictObject({ kind: z.literal('figures'), title: Text.optional(), items: z.array(z.strictObject({ label: Text, value: Text, tone: Tone, note: Text.optional() })).min(1).max(12) }),
  z.strictObject({ kind: z.literal('table'), title: Text.optional(), columns: z.array(Text).min(1).max(8), rows: z.array(z.array(z.string().max(120))).min(1).max(30) }),
  z.strictObject({ kind: z.literal('compare'), title: Text.optional(), symbols: z.array(SymbolId).min(2).max(5), metrics: z.array(z.strictObject({ label: Text, values: z.array(z.string().max(60)) })).min(1).max(12) }),
  z.strictObject({ kind: z.literal('chart'), symbol: SymbolId, interval: z.enum(INTERVALS).default('1D'), bars: z.number().int().min(10).max(260).default(60), levels: z.array(z.strictObject({ label: Text, price: z.number().positive() })).max(6).default([]) }),
  z.strictObject({ kind: z.literal('callout'), tone: Tone, title: Text, text: Text }),
  z.strictObject({ kind: z.literal('actions'), buttons: z.array(z.strictObject({ label: z.string().trim().min(1).max(40), action: ViewActionSchema })).min(1).max(6) }),
]);
export type ViewBlock = z.infer<typeof ViewBlockSchema>;

export const ChatViewSchema = z.strictObject({ title: Text.optional(), blocks: z.array(ViewBlockSchema).min(1).max(12) });
export type ChatView = z.infer<typeof ChatViewSchema>;

/**
 * A view the assistant writes itself, for anything the blocks cannot show. It runs in a sandboxed frame with no access to the user's session: it gets `data`
 * passed in, and it can ask for one of the actions above, which the app checks and the user confirms.
 */
export const CustomViewSchema = z.strictObject({
  title: Text,
  html: z.string().min(20).max(30_000),
  data: z.record(z.string(), z.unknown()).default({}),
  height: z.number().int().min(120).max(900).default(360),
});
export type CustomView = z.infer<typeof CustomViewSchema>;
