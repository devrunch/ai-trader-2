import { z } from 'zod';

/** How much the assistant may do on its own, set once per user. `act`: it trades on paper by itself inside these limits; `ask`: every trade is a card the user confirms. */
export const AssistantPrefsSchema = z.strictObject({
  mode: z.enum(['act', 'ask']),
  maxRiskPct: z.number().min(0.1).max(2),
  maxTradesPerDay: z.number().int().min(1).max(10),
});
export type AssistantPrefs = z.infer<typeof AssistantPrefsSchema>;
/** `allowed` is false when the admin has switched autonomy off for everyone; the mode then reads as `ask`. */
export const AssistantPrefsResponseSchema = AssistantPrefsSchema.extend({ allowed: z.boolean() });
export type AssistantPrefsResponse = z.infer<typeof AssistantPrefsResponseSchema>;
