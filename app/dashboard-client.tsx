'use client'

import { useCallback, useMemo, useState } from 'react'
import { CopilotKit } from '@copilotkit/react-core'
import { CopilotSidebar } from '@copilotkit/react-ui'
import { TARGET_REPOS } from '@/lib/repos'
import type { BreakingChange, TargetRepo } from '@/lib/types'
import type { LineVerdict, ProofResult, RunEvent } from '@/lib/events'

type RepoStatus = 'idle' | 'scanning' | 'done' | 'error'

type RepoView = {
  repo: TargetRepo
  status: RepoStatus
  verdicts: LineVerdict[]
  error?: string
}

type ProofState =
  | { status: 'idle' }
  | { status: 'running' }
  | { status: 'done'; proof: ProofResult }
  | { status: 'error'; message: string }

function idleViews(): RepoView[] {
  return TARGET_REPOS.map((repo) => ({ repo, status: 'idle' as RepoStatus, verdicts: [] }))
}

function scanningViews(): RepoView[] {
  return TARGET_REPOS.map((repo) => ({ repo, status: 'scanning' as RepoStatus, verdicts: [] }))
}

export default function DashboardClient({
  copilotEnabled,
  change,
  provider,
  apiVersion,
}: {
  copilotEnabled: boolean
  change: BreakingChange
  provider: string
  apiVersion: string
}) {
  const [repoViews, setRepoViews] = useState<RepoView[]>(idleViews)
  const [proof, setProof] = useState<ProofState>({ status: 'idle' })
  const [running, setRunning] = useState(false)
  const [hasRun, setHasRun] = useState(false)
  const [runError, setRunError] = useState<string>()

  const applyEvent = useCallback((event: RunEvent) => {
    switch (event.type) {
      case 'repo-done':
        setRepoViews((prev) =>
          prev.map((v) => (v.repo.id === event.repoId ? { ...v, status: 'done', verdicts: event.verdicts } : v))
        )
        break
      case 'repo-error':
        setRepoViews((prev) =>
          prev.map((v) => (v.repo.id === event.repoId ? { ...v, status: 'error', error: event.message } : v))
        )
        break
      case 'proof':
        setProof({ status: 'done', proof: event.proof })
        break
      case 'proof-error':
        setProof({ status: 'error', message: event.message })
        break
      default:
        break
    }
  }, [])

  const runPipeline = useCallback(async () => {
    setRunning(true)
    setHasRun(true)
    setRunError(undefined)
    setRepoViews(scanningViews())
    setProof({ status: 'running' })

    try {
      const res = await fetch('/api/run', { method: 'POST' })
      if (!res.ok || !res.body) throw new Error(`run endpoint returned ${res.status}`)

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.trim()) continue
          applyEvent(JSON.parse(line) as RunEvent)
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setRunError(message)
      setRepoViews((prev) =>
        prev.map((v) => (v.status === 'scanning' ? { ...v, status: 'error', error: `run interrupted: ${message}` } : v))
      )
      setProof((prev) => (prev.status === 'running' ? { status: 'error', message: `run interrupted: ${message}` } : prev))
    } finally {
      setRunning(false)
    }
  }, [applyEvent])

  const counts = useMemo(() => {
    const verdicts = repoViews.flatMap((v) => v.verdicts)
    return {
      matched: verdicts.length,
      patched: verdicts.filter((v) => v.genuine && v.patch).length,
      rejected: verdicts.filter((v) => !v.genuine).length,
      patchFailed: verdicts.filter((v) => v.genuine && !v.patch).length,
    }
  }, [repoViews])

  const content = (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-[var(--line)] bg-[var(--surface)]">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-8 gap-y-4 px-6 py-4">
          <div className="shrink-0">
            <h1 className="text-lg font-semibold tracking-tight text-[var(--ink)]">Graft</h1>
            <p className="micro text-[11px]">Detect · patch · prove · ship</p>
          </div>

          <div className="min-w-0 flex-1 rounded-md border border-[var(--line)] bg-[var(--raised)] px-4 py-2">
            <div className="micro text-[11px]">
              Breaking change · {provider} · {apiVersion}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
              <code className="mono text-[13px] text-[var(--rejected)] line-through [overflow-wrap:anywhere]">
                {change.oldAccessor}
              </code>
              <span className="text-[var(--muted)]">→</span>
              <code className="mono text-[13px] text-[var(--patched)] [overflow-wrap:anywhere]">
                {change.newAccessor}
              </code>
            </div>
          </div>

          <button
            onClick={runPipeline}
            disabled={running}
            className="shrink-0 rounded-md border border-[var(--accent)] px-5 py-2 text-sm font-semibold text-[var(--accent)] transition-colors hover:bg-[var(--running-bg)] disabled:cursor-not-allowed disabled:border-[var(--line)] disabled:text-[var(--muted)] disabled:hover:bg-transparent"
          >
            {running ? 'Running…' : 'Run pipeline'}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-6 py-8">
        <section className="mb-8 rounded-md border border-[var(--line)] bg-[var(--surface)] px-6 py-5">
          <div className="micro text-[11px]">Line-level verdicts</div>
          {hasRun ? (
            <>
              <div className="tnum mt-3 flex flex-wrap items-baseline gap-x-8 gap-y-3">
                <Stat value={counts.matched} label="lines matched" tone="var(--ink)" />
                <Stat value={counts.patched} label="patched" tone="var(--patched)" />
                <Stat value={counts.rejected} label="rejected" tone="var(--rejected)" />
                {counts.patchFailed > 0 && (
                  <Stat value={counts.patchFailed} label="patch failed" tone="var(--running)" />
                )}
              </div>
              <p className="mt-4 max-w-3xl text-sm text-[var(--ink-2)]">
                {counts.matched === 0 && running
                  ? 'Scanning repositories and classifying every candidate line…'
                  : `Grep matched ${counts.matched} lines across ${repoViews.length} repositories. Graft judged ${
                      counts.patched + counts.patchFailed
                    } of them genuine Stripe Subscription usage and rejected ${counts.rejected} as unrelated code that merely shares the field name.`}
              </p>
            </>
          ) : (
            <p className="mt-3 text-3xl font-semibold text-[var(--muted)]">Awaiting run</p>
          )}
        </section>

        {runError && (
          <div className="mb-8 rounded-md border border-[var(--rejected)] bg-[var(--rejected-bg)] px-4 py-3 text-sm text-[var(--rejected)]">
            Pipeline stream failed: {runError}. Results below are partial.
          </div>
        )}

        <div className="space-y-6">
          {repoViews.map((view) => (
            <RepoSection key={view.repo.id} view={view} proof={proof} />
          ))}
        </div>
      </main>
    </div>
  )

  if (!copilotEnabled) return content

  return (
    <CopilotKit runtimeUrl="/api/copilotkit">
      {content}
      <CopilotSidebar labels={{ title: 'Graft', initial: 'Ask about this pipeline.' }} />
    </CopilotKit>
  )
}

function Stat({ value, label, tone }: { value: number; label: string; tone: string }) {
  return (
    <div>
      <div className="text-5xl font-semibold leading-none" style={{ color: tone }}>
        {value}
      </div>
      <div className="micro mt-2 text-[11px]">{label}</div>
    </div>
  )
}

function RepoSection({ view, proof }: { view: RepoView; proof: ProofState }) {
  const genuine = view.verdicts.filter((v) => v.genuine).length
  const rejected = view.verdicts.filter((v) => !v.genuine).length

  return (
    <section className="rounded-md border border-[var(--line)] bg-[var(--surface)]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
        <h2 className="min-w-0 text-[15px] font-semibold text-[var(--ink)] [overflow-wrap:anywhere]">
          {view.repo.name}
        </h2>
        {view.status === 'scanning' && <Badge tone="running" glyph="" label="SCANNING" pulse />}
        {view.status === 'error' && <Badge tone="rejected" glyph="✕" label="ERROR" />}
        {view.status === 'done' && (
          <span className="tnum shrink-0 text-[13px] text-[var(--ink-2)]">
            <span className="text-[var(--patched)]">{genuine} genuine</span>
            <span className="text-[var(--muted)]"> · </span>
            <span className="text-[var(--rejected)]">{rejected} rejected</span>
          </span>
        )}
      </header>

      {view.status === 'error' && (
        <p className="px-4 py-3 text-[13px] text-[var(--rejected)]">{view.error}</p>
      )}

      {view.status === 'scanning' && (
        <p className="px-4 py-3 text-[13px] text-[var(--muted)]">Classifying candidate lines…</p>
      )}

      {view.status === 'done' && view.verdicts.length === 0 && (
        <p className="px-4 py-3 text-[13px] text-[var(--muted)]">No candidate lines.</p>
      )}

      {view.verdicts.length > 0 && (
        <div className="divide-y divide-[var(--line)]">
          {view.verdicts.map((verdict) => (
            <VerdictRow key={`${verdict.file}:${verdict.line}`} verdict={verdict} proof={proof} />
          ))}
        </div>
      )}
    </section>
  )
}

function VerdictRow({ verdict, proof }: { verdict: LineVerdict; proof: ProofState }) {
  const stripe = !verdict.genuine ? 'var(--rejected)' : verdict.patch ? 'var(--patched)' : 'var(--running)'
  const background = verdict.genuine ? 'transparent' : 'var(--rejected-bg)'

  return (
    <article className="border-l-4 px-4 py-4" style={{ borderLeftColor: stripe, backgroundColor: background }}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <code className="mono tnum min-w-0 text-[13px] text-[var(--ink-2)] [overflow-wrap:anywhere]">
          {verdict.file}:{verdict.line}
        </code>
        {verdict.genuine ? (
          <Badge tone="patched" glyph="✓" label="GENUINE" />
        ) : (
          <Badge tone="rejected" glyph="✕" label="REJECTED" />
        )}
      </div>

      <CodeLine text={verdict.text} tone="var(--ink)" />

      <p className="mt-3 text-[13px] leading-relaxed text-[var(--ink-2)]">
        <span className="micro mr-2 text-[11px]">Classifier reason</span>
        {verdict.reason}
      </p>

      {verdict.patch && (
        <div className="mt-4">
          <div className="micro text-[11px]">Patch</div>
          <CodeLine text={`- ${verdict.patch.before.trim()}`} tone="var(--rejected)" />
          <CodeLine text={`+ ${verdict.patch.after.trim()}`} tone="var(--patched)" />
        </div>
      )}

      {verdict.genuine && verdict.patchError && (
        <p className="mt-4 rounded-md border border-[var(--running)] bg-[var(--running-bg)] px-3 py-2 text-[13px] text-[var(--running)]">
          No patch produced: {verdict.patchError}
        </p>
      )}

      {verdict.genuine && <ProofBlock proof={proof} />}
    </article>
  )
}

function CodeLine({ text, tone }: { text: string; tone: string }) {
  return (
    <div className="mt-2 overflow-x-auto rounded-md bg-[var(--ground)] px-3 py-2">
      <code className="mono whitespace-pre text-[13px]" style={{ color: tone }}>
        {text.trim()}
      </code>
    </div>
  )
}

function ProofBlock({ proof }: { proof: ProofState }) {
  if (proof.status === 'idle') return null

  if (proof.status === 'running') {
    return (
      <div className="mt-4">
        <div className="micro text-[11px]">Sandbox proof</div>
        <p className="mt-2 text-[13px] text-[var(--muted)]">Running in Daytona…</p>
      </div>
    )
  }

  if (proof.status === 'error') {
    return (
      <div className="mt-4">
        <div className="micro text-[11px]">Sandbox proof</div>
        <p className="mt-2 rounded-md border border-[var(--rejected)] bg-[var(--rejected-bg)] px-3 py-2 text-[13px] text-[var(--rejected)]">
          ✕ Not verified: {proof.message}
        </p>
      </div>
    )
  }

  const { before, after, passed } = proof.proof

  if (!passed) {
    return (
      <div className="mt-4">
        <div className="micro text-[11px]">Sandbox proof</div>
        <div className="mt-2 rounded-md border border-[var(--rejected)] bg-[var(--rejected-bg)] px-3 py-2">
          <p className="text-[13px] font-semibold text-[var(--rejected)]">✕ Verification did not pass</p>
          <pre className="mono mt-2 max-h-20 overflow-auto whitespace-pre-wrap text-[11px] leading-snug text-[var(--ink-2)]">
            {before === after ? before : `${before}\n${after}`}
          </pre>
        </div>
      </div>
    )
  }

  return (
    <div className="mt-4">
      <div className="micro text-[11px]">Sandbox proof · Daytona · live Stripe API</div>
      <div className="mt-2 rounded-md border border-[var(--line)] bg-[var(--patched-bg)] px-3 py-2">
        <p className="mono text-[13px] text-[var(--rejected)]">{before}</p>
        <p className="mono mt-1 text-[13px] text-[var(--patched)]">{after}</p>
        <p className="mt-2 text-[12px] text-[var(--muted)]">
          Shared accessor proof: one sandbox run of the migrated accessor, not a per-line execution.
        </p>
      </div>
    </div>
  )
}

function Badge({
  tone,
  glyph,
  label,
  pulse,
}: {
  tone: 'patched' | 'rejected' | 'running'
  glyph: string
  label: string
  pulse?: boolean
}) {
  const color = `var(--${tone})`
  const background = `var(--${tone}-bg)`
  return (
    <span
      className={`shrink-0 rounded px-2 py-1 text-[13px] font-bold ${pulse ? 'animate-pulse' : ''}`}
      style={{ color, backgroundColor: background }}
    >
      {glyph ? `${glyph} ` : ''}
      {label}
    </span>
  )
}
