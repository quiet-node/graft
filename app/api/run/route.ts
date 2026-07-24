import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { NextRequest } from 'next/server'
import { loadBreakingChanges } from '@/lib/detect'
import { TARGET_REPOS } from '@/lib/repos'
import { scanRepo } from '@/lib/scan'
import { generatePatch } from '@/lib/patch'
import { verifyPatch } from '@/lib/verify'
import type { LineVerdict, RunEvent } from '@/lib/events'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Budgets are deliberately loose: a single repo runs one classifier call per candidate
// line, sequentially, so a healthy scan of the largest repo already takes tens of seconds.
// The outer budget has to clear the inner one: lib/patch retries a timed-out call once, so a
// worst-case patch is two full per-call timeouts plus the wait for a concurrency slot. At 45s
// this timer fired first and reported a spurious "patch failed" while the retry was still in
// flight. The invariant is outer > inner * (1 + retries) + queue slack.
const SCAN_TIMEOUT_MS = 120_000
const PATCH_TIMEOUT_MS = 60_000
const VERIFY_TIMEOUT_MS = 150_000

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms)
    promise.then(resolve, reject).finally(() => clearTimeout(timer))
  })
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export async function POST(req: NextRequest) {
  const change = loadBreakingChanges().find((c) => c.field === 'current_period_end')
  if (!change) {
    return new Response(JSON.stringify({ error: 'current_period_end breaking change not found' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false
      const send = (event: RunEvent) => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))
        } catch {
          closed = true
        }
      }

      req.signal.addEventListener('abort', () => {
        closed = true
      })

      send({ type: 'run-start', repoIds: TARGET_REPOS.map((r) => r.id) })

      // The sandbox proof is generic: it demonstrates the accessor migration against the
      // live Stripe API once, independently of which lines matched. Running it alongside
      // the scan keeps the slow Daytona round trip off the critical path.
      const verifyTask = (async () => {
        try {
          const proof = await withTimeout(
            verifyPatch(
              { file: '', line: 0, text: change.oldAccessor, genuine: true, reason: 'accessor proof' },
              { before: change.oldAccessor, after: change.newAccessor }
            ),
            VERIFY_TIMEOUT_MS,
            'sandbox verification'
          )
          send({ type: 'proof', proof })
        } catch (err) {
          send({ type: 'proof-error', message: errorMessage(err) })
        }
      })()

      const scanTasks = TARGET_REPOS.map(async (repo) => {
        try {
          if (!existsSync(join(process.cwd(), repo.localPath))) {
            send({ type: 'repo-error', repoId: repo.id, message: `not cloned at ${repo.localPath}` })
            return
          }

          const result = await withTimeout(scanRepo(repo, change), SCAN_TIMEOUT_MS, `scan of ${repo.name}`)

          const verdicts = await Promise.all(
            result.hits.map(async (hit): Promise<LineVerdict> => {
              const base: LineVerdict = {
                file: hit.file,
                line: hit.line,
                text: hit.text,
                genuine: hit.genuine,
                reason: hit.reason,
                ...(hit.classifierFailed && { classifierFailed: hit.classifierFailed }),
              }
              if (!hit.genuine) return base
              try {
                const patch = await withTimeout(
                  generatePatch(hit, change),
                  PATCH_TIMEOUT_MS,
                  `patch for ${hit.file}:${hit.line}`
                )
                if (patch.after.trim() === patch.before.trim()) {
                  return { ...base, patchError: 'patch generator returned the line unchanged' }
                }
                return { ...base, patch }
              } catch (err) {
                return { ...base, patchError: errorMessage(err) }
              }
            })
          )

          send({ type: 'repo-done', repoId: repo.id, verdicts })
        } catch (err) {
          send({ type: 'repo-error', repoId: repo.id, message: errorMessage(err) })
        }
      })

      await Promise.all([...scanTasks, verifyTask])

      send({ type: 'done' })
      if (!closed) {
        closed = true
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
