import { CopilotRuntime, OpenAIAdapter, copilotRuntimeNextJSAppRouterEndpoint } from '@copilotkit/runtime'
import { NextRequest } from 'next/server'
import { fireworks, FIREWORKS_MODEL } from '@/lib/fireworks'

export async function POST(req: NextRequest) {
  if (!process.env.FIREWORKS_API_KEY) {
    return new Response(JSON.stringify({ error: 'FIREWORKS_API_KEY not configured' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // The adapter defaults to an OpenAI model id, which Fireworks rejects with "Model not
  // found". The pipeline's own model is named explicitly so the chat runs on the same
  // Fireworks deployment as the scan and patch calls.
  const serviceAdapter = new OpenAIAdapter({ openai: fireworks, model: FIREWORKS_MODEL })
  const runtime = new CopilotRuntime()

  const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
    runtime,
    serviceAdapter,
    endpoint: '/api/copilotkit',
  })

  return handleRequest(req)
}
