import OpenAI from 'openai'

// gpt-oss-20b: cheap ($0.07/$0.30 per 1M in/out), fast, supports JSON mode.
// Confirmed available on Fireworks serverless via docs.fireworks.ai/serverless/pricing
// and docs.fireworks.ai/guides/querying-embeddings-models (model id `fireworks/gpt-oss-20b`).
export const FIREWORKS_MODEL = 'accounts/fireworks/models/gpt-oss-20b'

export const fireworks = new OpenAI({
  apiKey: process.env.FIREWORKS_API_KEY,
  baseURL: 'https://api.fireworks.ai/inference/v1',
})

// $ per 1M tokens, standard serving path (docs.fireworks.ai/serverless/pricing)
export const FIREWORKS_PRICE_PER_M = { input: 0.07, output: 0.3 }

export const usage = { calls: 0, promptTokens: 0, completionTokens: 0 }

export function recordUsage(res: { usage?: { prompt_tokens?: number; completion_tokens?: number } }) {
  usage.calls += 1
  usage.promptTokens += res.usage?.prompt_tokens ?? 0
  usage.completionTokens += res.usage?.completion_tokens ?? 0
}
