import { CopilotRuntime, OpenAIAdapter, copilotRuntimeNextJSAppRouterEndpoint } from '@copilotkit/runtime'
import OpenAI from 'openai'
import { NextRequest } from 'next/server'

export async function POST(req: NextRequest) {
  const apiKey = process.env.FIREWORKS_API_KEY

  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'FIREWORKS_API_KEY not configured' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const openai = new OpenAI({
    apiKey,
    baseURL: 'https://api.fireworks.ai/inference/v1',
  })
  const serviceAdapter = new OpenAIAdapter({ openai })
  const runtime = new CopilotRuntime()

  const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
    runtime,
    serviceAdapter,
    endpoint: '/api/copilotkit',
  })

  return handleRequest(req)
}
