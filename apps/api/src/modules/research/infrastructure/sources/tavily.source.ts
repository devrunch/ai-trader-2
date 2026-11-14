import { z } from 'zod';
import type { SourceClient, SourceDescriptor } from '../../../../shared/sources';
import type { WebResult, WebSearchSource } from '../../application/research';

export const TAVILY_DESCRIPTOR: SourceDescriptor = {
  id: 'tavily', owner: 'research', kind: 'web-search', markets: ['india', 'us', 'forex', 'commodities', 'crypto'], envKeys: ['TAVILY_API_KEY'],
  rateLimit: { requests: 30, windowSec: 60 }, schedule: 'on-demand',
  terms: 'Tavily search API with our own key (POST api.tavily.com/search); query text only, at most AGENT_WEB_SEARCH_DAILY calls a day, results shown with title and link.',
  docs: 'https://docs.tavily.com/documentation/api-reference/endpoint/search',
};

const Response = z.object({ results: z.array(z.object({ title: z.string(), url: z.string(), content: z.string().optional() })) });

/** Tavily web search; only with TAVILY_API_KEY. */
export class TavilySource implements WebSearchSource {
  constructor(private readonly key: string, private readonly client: SourceClient) {}

  async search(query: string, limit: number, signal: AbortSignal): Promise<WebResult[]> {
    const { text } = await this.client.get(TAVILY_DESCRIPTOR.id, 'https://api.tavily.com/search', { signal, timeoutMs: 20_000,
      headers: { authorization: `Bearer ${this.key}`, 'content-type': 'application/json' }, body: JSON.stringify({ query, max_results: limit, search_depth: 'basic' }) });
    const results = Response.parse(JSON.parse(text)).results.filter(r => /^https?:\/\//.test(r.url))
      .map(r => ({ title: r.title.slice(0, 200), url: r.url, snippet: (r.content ?? '').replace(/\s+/g, ' ').trim().slice(0, 500) }));
    await this.client.recordItems(TAVILY_DESCRIPTOR.id, results.length);
    return results;
  }
}
