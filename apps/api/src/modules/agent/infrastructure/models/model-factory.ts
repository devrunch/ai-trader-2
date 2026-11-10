import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createXai } from '@ai-sdk/xai';
import type { LanguageModel } from 'ai';
import { bedrockMantleKey } from './bedrock-mantle-key';

const PROVIDERS = ['bedrock-mantle', 'anthropic', 'xai', 'openai', 'openai-compatible'] as const;
type Provider = (typeof PROVIDERS)[number];
export interface ModelSpec { provider: Provider; modelId: string }
export interface ModelEnv {
  AGENT_BASE_URL?: string | undefined; AGENT_API_KEY?: string | undefined;
  ANTHROPIC_API_KEY?: string | undefined; OPENAI_API_KEY?: string | undefined; XAI_API_KEY?: string | undefined;
  BEDROCK_API_KEY?: string | undefined; BEDROCK_BASE_URL?: string | undefined; AWS_REGION?: string | undefined;
  AWS_ACCESS_KEY_ID?: string | undefined; AWS_SECRET_ACCESS_KEY?: string | undefined; AWS_SESSION_TOKEN?: string | undefined;
}

class ModelConfigError extends Error { override readonly name = 'ModelConfigError'; }

/** `provider/model`; the model id may itself contain slashes (OpenRouter) or colons (Bedrock). */
export function parseModelSpec(spec: string): ModelSpec {
  const slash = spec.indexOf('/');
  const provider = slash < 0 ? spec : spec.slice(0, slash);
  const modelId = slash < 0 ? '' : spec.slice(slash + 1);
  if (!(PROVIDERS as readonly string[]).includes(provider)) throw new ModelConfigError(`Unknown model provider "${provider}"; use one of ${PROVIDERS.join(', ')}`);
  if (!modelId) throw new ModelConfigError(`Missing model id in "${spec}"; write provider/model`);
  return { provider: provider as Provider, modelId };
}

const need = (value: string | undefined, name: string, spec: ModelSpec): string => {
  if (!value) throw new ModelConfigError(`${spec.provider}/${spec.modelId} needs ${name} in apps/api/.env`);
  return value;
};

/** Bearer keys generated from AWS credentials last 12 h; renew an hour early. */
function mantleKeySource(env: ModelEnv, spec: ModelSpec): () => Promise<string> {
  if (env.BEDROCK_API_KEY) { const key = env.BEDROCK_API_KEY; return () => Promise.resolve(key); }
  if (!env.AWS_ACCESS_KEY_ID || !env.AWS_SECRET_ACCESS_KEY) throw new ModelConfigError(`${spec.provider}/${spec.modelId} needs BEDROCK_API_KEY or AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in apps/api/.env`);
  const creds = { accessKeyId: env.AWS_ACCESS_KEY_ID, secretAccessKey: env.AWS_SECRET_ACCESS_KEY, region: env.AWS_REGION ?? 'ap-south-1',
    ...(env.AWS_SESSION_TOKEN ? { sessionToken: env.AWS_SESSION_TOKEN } : {}) };
  let cached: { key: string; renewAt: number } | undefined;
  return async () => {
    if (!cached || Date.now() >= cached.renewAt) cached = { key: await bedrockMantleKey(creds), renewAt: Date.now() + 11 * 3_600_000 };
    return cached.key;
  };
}

/** Any supported provider and model, chosen in configuration (owner requirement: Bedrock, Claude, Grok, OpenAI or any compatible API). */
export function createLanguageModel(spec: ModelSpec, env: ModelEnv): Exclude<LanguageModel, string> {
  switch (spec.provider) {
    case 'anthropic': return createAnthropic({ apiKey: need(env.ANTHROPIC_API_KEY, 'ANTHROPIC_API_KEY', spec) })(spec.modelId);
    case 'openai': return createOpenAI({ apiKey: need(env.OPENAI_API_KEY, 'OPENAI_API_KEY', spec) })(spec.modelId);
    case 'xai': return createXai({ apiKey: need(env.XAI_API_KEY, 'XAI_API_KEY', spec) })(spec.modelId);
    case 'openai-compatible':
      return createOpenAICompatible({ name: 'openai-compatible', baseURL: need(env.AGENT_BASE_URL, 'AGENT_BASE_URL', spec),
        apiKey: need(env.AGENT_API_KEY, 'AGENT_API_KEY', spec) }).chatModel(spec.modelId);
    case 'bedrock-mantle': {
      const region = env.AWS_REGION ?? 'ap-south-1';
      const key = mantleKeySource(env, spec);
      // The key is fetched per request, so a generated key renews without rebuilding the model.
      return createOpenAICompatible({ name: 'bedrock-mantle', baseURL: env.BEDROCK_BASE_URL ?? `https://bedrock-mantle.${region}.api.aws/v1`,
        fetch: async (input, init) => {
          const headers = new Headers(init?.headers);
          headers.set('authorization', `Bearer ${await key()}`);
          return fetch(input, { ...init, headers });
        } }).chatModel(spec.modelId);
    }
  }
}
