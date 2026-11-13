import { generateText, Output, type LanguageModel } from 'ai';
import { z } from 'zod';
import { SENTIMENT_LABELS, type Sentiment } from '@aitrader/contracts';
import type { SourceClient, SourceDescriptor } from '../../../../shared/sources';
import { inBatches, type BatchScorer, type SentimentInput } from '../../application/sentiment';

export const LLM_SENTIMENT_DESCRIPTOR: SourceDescriptor = {
  id: 'llm-sentiment', owner: 'news', kind: 'sentiment', markets: ['india', 'us', 'forex', 'commodities', 'crypto'], envKeys: ['AGENT_MODEL'],
  rateLimit: { requests: 600, windowSec: 3600 }, schedule: 'on-demand',
  terms: 'The configured cheap model (DESK_MODEL, else AGENT_MODEL) scores headline text we already store; capped at NEWS_LLM_DAILY items a day.',
  docs: 'https://ai-sdk.dev/docs',
};

/** What the cheap model must return for a batch of headlines: one verdict per id. */
export const LlmSentimentBatch = z.object({ items: z.array(z.object({ id: z.string(), label: z.enum(SENTIMENT_LABELS), score: z.number().min(-1).max(1) })) });

const BATCH = 25;
const SYSTEM = 'You score financial headlines for a trader. For each headline give the sentiment for the market or instrument it concerns: '
  + '"bullish" (good for prices), "bearish" (bad for prices) or "neutral", and a score from -1 (very bearish) to 1 (very bullish). '
  + 'Judge only the text given. Return one verdict per headline, with the same id.';

/** Batch sentiment from the cheap model: structured JSON, schema-checked; ids the model skips or invents are dropped (they fall to the next scorer). */
export class LlmScorer implements BatchScorer {
  constructor(private readonly model: Exclude<LanguageModel, string>, private readonly client: SourceClient, private readonly timeoutMs = 60_000) {}

  async score(items: SentimentInput[], signal: AbortSignal): Promise<Map<string, Sentiment>> {
    const out = new Map<string, Sentiment>();
    for (const batch of inBatches(items, BATCH)) {
      const known = new Set(batch.map(b => b.id));
      const result = await generateText({ model: this.model, instructions: SYSTEM, temperature: 0, output: Output.object({ schema: LlmSentimentBatch }),
        prompt: batch.map(b => `${b.id}: ${b.text}`).join('\n'), abortSignal: AbortSignal.any([signal, AbortSignal.timeout(this.timeoutMs)]) });
      for (const v of LlmSentimentBatch.parse(result.output).items) if (known.has(v.id)) out.set(v.id, { label: v.label, score: Math.round(v.score * 100) / 100, by: 'llm' });
    }
    await this.client.recordItems(LLM_SENTIMENT_DESCRIPTOR.id, out.size);
    return out;
  }
}
