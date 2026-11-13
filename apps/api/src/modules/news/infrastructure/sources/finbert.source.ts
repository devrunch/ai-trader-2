import { z } from 'zod';
import type { Sentiment } from '@aitrader/contracts';
import type { SourceClient, SourceDescriptor } from '../../../../shared/sources';
import { inBatches, type BatchScorer, type SentimentInput } from '../../application/sentiment';
import { labelOf } from '../../domain/sentiment';

export const FINBERT_DESCRIPTOR: SourceDescriptor = {
  id: 'finbert', owner: 'news', kind: 'sentiment', markets: ['india', 'us', 'forex', 'commodities', 'crypto'], envKeys: ['HF_API_TOKEN', 'FINBERT_MODEL'],
  rateLimit: { requests: 30, windowSec: 3600 }, schedule: 'on-demand',
  terms: 'Hugging Face Inference API with our own token on the free tier; headline text only, batched, used when the LLM daily cap is spent.',
  docs: 'https://huggingface.co/docs/api-inference',
};

const Labels = z.array(z.object({ label: z.string(), score: z.number() }));
const Response = z.array(Labels);
const BATCH = 32;

/** FinBERT scores a headline as positive, negative or neutral probabilities; sentiment is positive minus negative. */
export class FinbertScorer implements BatchScorer {
  constructor(private readonly token: string, private readonly model: string, private readonly client: SourceClient) {}

  async score(items: SentimentInput[], signal: AbortSignal): Promise<Map<string, Sentiment>> {
    const out = new Map<string, Sentiment>();
    for (const batch of inBatches(items, BATCH)) {
      const { text } = await this.client.get(FINBERT_DESCRIPTOR.id, `https://api-inference.huggingface.co/models/${this.model}`, { signal, timeoutMs: 30_000,
        headers: { authorization: `Bearer ${this.token}`, 'content-type': 'application/json' }, body: JSON.stringify({ inputs: batch.map(b => b.text), options: { wait_for_model: true } }) });
      const parsed = Response.parse(JSON.parse(text));
      if (parsed.length !== batch.length) throw new Error(`finbert: sent ${String(batch.length)} headlines, got ${String(parsed.length)} verdicts (the response changed shape)`);
      parsed.forEach((probs, j) => {
        const p = (label: string): number => probs.find(x => x.label.toLowerCase() === label)?.score ?? 0;
        const score = Math.round((p('positive') - p('negative')) * 100) / 100;
        const id = batch[j]?.id;
        if (id !== undefined) out.set(id, { label: labelOf(score), score, by: 'finbert' });
      });
    }
    await this.client.recordItems(FINBERT_DESCRIPTOR.id, out.size);
    return out;
  }
}
