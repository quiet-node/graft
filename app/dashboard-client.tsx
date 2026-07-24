'use client'

import { useCallback, useMemo, useState } from 'react'
import { CopilotKit, useCopilotReadable } from '@copilotkit/react-core'
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
    // The four outcome counts partition the scanned lines: a line the classifier never
    // judged is counted on its own and never folded into rejected.
    return {
      matched: verdicts.length,
      patched: verdicts.filter((v) => v.genuine && v.patch).length,
      rejected: verdicts.filter((v) => !v.genuine && !v.classifierFailed).length,
      patchFailed: verdicts.filter((v) => v.genuine && !v.patch).length,
      classifierFailed: verdicts.filter((v) => v.classifierFailed).length,
    }
  }, [repoViews])

  const content = (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-[var(--line)] bg-[var(--surface)]">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-10 gap-y-4 px-6 py-4">
          <div className="shrink-0">
            <h1 className="text-[17px] font-semibold leading-none tracking-tight text-[var(--ink)]">Graft AI</h1>
            <p className="micro mt-2">Detect · Patch · Prove · Ship</p>
          </div>

          <div className="min-w-0 flex-1">
            <div className="micro">
              Breaking change · {provider} · {apiVersion}
            </div>
            <div className="mono mt-2 overflow-x-auto whitespace-nowrap text-[13px] leading-none">
              <span className="text-[var(--ink-4)] line-through">{change.oldAccessor}</span>
              <span className="px-3 text-[var(--ink-4)]">-&gt;</span>
              <span className="text-[var(--ink)]">{change.newAccessor}</span>
            </div>
          </div>

          <button
            onClick={runPipeline}
            disabled={running}
            className="shrink-0 rounded border border-[var(--ink)] px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--ink)] transition-colors hover:bg-[var(--raised)] disabled:cursor-not-allowed disabled:border-[var(--line)] disabled:text-[var(--ink-4)] disabled:hover:bg-transparent"
          >
            {running ? 'Running' : 'Run pipeline'}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-6 py-10">
        <section className="mb-10 border-b border-[var(--line)] pb-10">
          <div className="micro">Line-level verdicts</div>
          {hasRun ? (
            <>
              <div className="mt-6 flex flex-wrap items-start gap-y-6">
                <Stat value={counts.matched} label="Scanned" tone="var(--ink-2)" />
                <Slash />
                <Stat value={counts.patched} label="Patched" tone="var(--ink)" />
                <Slash />
                <Stat value={counts.rejected} label="Rejected" tone="var(--ink-3)" />
                {counts.patchFailed > 0 && (
                  <>
                    <Slash />
                    <Stat value={counts.patchFailed} label="Patch failed" tone="var(--ink-3)" />
                  </>
                )}
                {counts.classifierFailed > 0 && (
                  <>
                    <Slash />
                    <Stat value={counts.classifierFailed} label="Classifier failed" tone="var(--ink-3)" />
                  </>
                )}
              </div>
              <p className="prose-line mt-8 max-w-3xl text-[13px] text-[var(--ink-2)]">
                {counts.matched === 0 && running
                  ? 'Scanning repositories and classifying every candidate line.'
                  : `Grep matched ${counts.matched} lines across ${repoViews.length} repositories. Graft judged ${
                      counts.patched + counts.patchFailed
                    } of them genuine Stripe Subscription usage and rejected ${counts.rejected} as unrelated code that merely shares the field name.${
                      counts.classifierFailed > 0
                        ? ` ${counts.classifierFailed} ${
                            counts.classifierFailed === 1 ? 'line was' : 'lines were'
                          } left unjudged because the classifier call failed, and ${
                            counts.classifierFailed === 1 ? 'is' : 'are'
                          } counted in neither total.`
                        : ''
                    }`}
              </p>
            </>
          ) : (
            <p className="mono mt-6 text-[44px] font-medium leading-none text-[var(--ink-4)]">Awaiting run</p>
          )}
        </section>

        {runError && (
          <p className="prose-line mb-10 border border-[var(--line-strong)] px-4 py-3 text-[13px] text-[var(--ink-2)]">
            Pipeline stream failed: {runError}. Results below are partial.
          </p>
        )}

        <div className="space-y-12">
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
      <PipelineContext change={change} provider={provider} counts={counts} repoViews={repoViews} hasRun={hasRun} />
      {content}
      <CopilotSidebar labels={{ title: 'Graft', initial: 'Ask about this pipeline.' }} />
    </CopilotKit>
  )
}

// Feeds the current run into the chat so questions are answered from what Graft actually
// found rather than from the model's general knowledge. The hook has to sit inside the
// CopilotKit provider, so it lives in its own render-nothing child.
function PipelineContext({
  change,
  provider,
  counts,
  repoViews,
  hasRun,
}: {
  change: BreakingChange
  provider: string
  counts: { matched: number; patched: number; rejected: number; patchFailed: number; classifierFailed: number }
  repoViews: RepoView[]
  hasRun: boolean
}) {
  useCopilotReadable({
    description:
      'The current state of the Graft pipeline: it scans repositories for a breaking API change, ' +
      'classifies every matching line as genuine breakage or unrelated code, patches the genuine ' +
      'ones, and proves the migrated accessor in a Daytona sandbox against the live Stripe API.',
    value: {
      breakingChange: {
        provider,
        field: change.field,
        oldAccessor: change.oldAccessor,
        newAccessor: change.newAccessor,
      },
      hasRun,
      counts: {
        scanned: counts.matched,
        patched: counts.patched,
        rejected: counts.rejected,
        patchFailed: counts.patchFailed,
        // Lines the classifier never judged. They are not rejections.
        classifierFailed: counts.classifierFailed,
      },
      repositories: repoViews.map((view) => ({
        name: view.repo.name,
        status: view.status,
        verdicts: view.verdicts.map((v) => ({
          file: v.file,
          line: v.line,
          outcome: v.classifierFailed
            ? 'classifier-failed'
            : v.genuine
              ? v.patch
                ? 'patched'
                : 'patch-failed'
              : 'rejected',
          reason: v.reason,
          patchedTo: v.patch?.after.trim(),
        })),
      })),
    },
  })
  return null
}

function Stat({ value, label, tone }: { value: number; label: string; tone: string }) {
  return (
    <div className="pr-2">
      <div className="mono text-[56px] font-medium leading-none" style={{ color: tone }}>
        {value}
      </div>
      <div className="micro mt-3">{label}</div>
    </div>
  )
}

function Slash() {
  return <div className="mono px-5 text-[56px] font-thin leading-none text-[var(--line-strong)]">/</div>
}

function RepoSection({ view, proof }: { view: RepoView; proof: ProofState }) {
  const patched = view.verdicts.filter((v) => v.genuine && v.patch).length
  const rejected = view.verdicts.filter((v) => !v.genuine && !v.classifierFailed).length
  const classifierFailed = view.verdicts.filter((v) => v.classifierFailed).length

  return (
    <section>
      <header className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-b border-[var(--line-strong)] pb-3">
        <h2 className="mono min-w-0 text-[14px] font-medium text-[var(--ink)] [overflow-wrap:anywhere]">
          {view.repo.name}
        </h2>
        {view.status === 'scanning' && <span className="micro animate-pulse">Scanning</span>}
        {view.status === 'error' && <span className="micro">Error</span>}
        {view.status === 'done' && (
          <span className="mono shrink-0 text-[12px] text-[var(--ink-3)]">
            <span className="text-[var(--ink)]">{patched} patched</span>
            <span className="px-2 text-[var(--ink-4)]">/</span>
            <span>{rejected} rejected</span>
            {classifierFailed > 0 && (
              <>
                <span className="px-2 text-[var(--ink-4)]">/</span>
                <span>{classifierFailed} classifier failed</span>
              </>
            )}
          </span>
        )}
      </header>

      {view.status === 'error' && (
        <p className="prose-line px-4 py-4 text-[13px] text-[var(--ink-2)]">{view.error}</p>
      )}

      {view.status === 'scanning' && (
        <p className="px-4 py-4 text-[13px] text-[var(--ink-3)]">Classifying candidate lines.</p>
      )}

      {view.status === 'done' && view.verdicts.length === 0 && (
        <p className="px-4 py-4 text-[13px] text-[var(--ink-3)]">No candidate lines.</p>
      )}

      {view.verdicts.length > 0 && (
        <div>
          {view.verdicts.map((verdict) => (
            <VerdictRow key={`${verdict.file}:${verdict.line}`} verdict={verdict} proof={proof} />
          ))}
        </div>
      )}
    </section>
  )
}

// Patched, rejected, patch-failed and classifier-failed rows are told apart by value, weight,
// rule presence and surface elevation only. No colour and no iconography anywhere. A
// classifier-failed row carries no verdict, so it is never struck through like a rejection.
function VerdictRow({ verdict, proof }: { verdict: LineVerdict; proof: ProofState }) {
  const isClassifierFailed = Boolean(verdict.classifierFailed)
  const isPatched = verdict.genuine && Boolean(verdict.patch)
  const isRejected = !verdict.genuine && !isClassifierFailed

  const rule = isPatched ? 'var(--ink)' : isRejected ? 'transparent' : 'var(--line-strong)'
  const surface = isPatched ? 'var(--raised)' : isRejected ? 'var(--ground)' : 'var(--surface)'
  const pathInk = isRejected ? 'var(--ink-4)' : 'var(--ink-2)'
  const verdictLabel = isClassifierFailed
    ? 'Classifier failed'
    : isPatched
      ? 'Patched'
      : isRejected
        ? 'Rejected'
        : 'Patch failed'

  return (
    <article
      className="border-b border-[var(--line)] px-5 py-6"
      style={{ borderLeft: `3px solid ${rule}`, backgroundColor: surface }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <code className="mono min-w-0 text-[12px] [overflow-wrap:anywhere]" style={{ color: pathInk }}>
          {verdict.file}:{verdict.line}
        </code>
        <span
          className="shrink-0 text-[11px] uppercase tracking-[0.1em]"
          style={{
            color: isPatched ? 'var(--ink)' : 'var(--ink-3)',
            fontWeight: isPatched ? 600 : 500,
          }}
        >
          {verdictLabel}
        </span>
      </div>

      <CodeLine
        text={verdict.text}
        tone={isRejected ? 'var(--ink-3)' : 'var(--ink)'}
        struck={isRejected}
        sunken={!isRejected}
      />

      <p className="prose-line mt-4 max-w-3xl text-[13px]" style={{ color: isRejected ? 'var(--ink-3)' : 'var(--ink-2)' }}>
        <span className="micro mr-3 align-baseline">{isClassifierFailed ? 'No verdict reached' : 'Classifier reason'}</span>
        {verdict.reason}
      </p>

      {verdict.patch && (
        <div className="mt-6">
          <div className="micro">Patch</div>
          <CodeLine text={`- ${verdict.patch.before.trim()}`} tone="var(--ink-3)" struck sunken />
          <CodeLine text={`+ ${verdict.patch.after.trim()}`} tone="var(--ink)" sunken />
        </div>
      )}

      {verdict.genuine && verdict.patchError && (
        <p className="prose-line mt-6 border border-[var(--line-strong)] px-4 py-3 text-[13px] text-[var(--ink-2)]">
          No patch produced: {verdict.patchError}
        </p>
      )}

      {isPatched && <ProofBlock proof={proof} />}
    </article>
  )
}

function CodeLine({
  text,
  tone,
  struck,
  sunken,
}: {
  text: string
  tone: string
  struck?: boolean
  sunken?: boolean
}) {
  return (
    <div
      className="mt-3 overflow-x-auto px-3 py-2"
      style={{ backgroundColor: sunken ? 'var(--ground)' : 'transparent' }}
    >
      <code
        className="mono whitespace-pre text-[12.5px] leading-snug"
        style={{ color: tone, textDecoration: struck ? 'line-through' : 'none' }}
      >
        {text.trim()}
      </code>
    </div>
  )
}

function ProofBlock({ proof }: { proof: ProofState }) {
  if (proof.status === 'idle') {
    return (
      <div className="mt-6">
        <div className="micro">Sandbox proof</div>
        <p className="prose-line mt-3 text-[13px] text-[var(--ink-3)]">Verification did not run.</p>
      </div>
    )
  }

  if (proof.status === 'running') {
    return (
      <div className="mt-6">
        <div className="micro">Sandbox proof</div>
        <p className="prose-line mt-3 text-[13px] text-[var(--ink-3)]">Running in Daytona.</p>
      </div>
    )
  }

  if (proof.status === 'error') {
    return (
      <div className="mt-6">
        <div className="micro">Sandbox proof</div>
        <p className="prose-line mt-3 border border-[var(--line-strong)] px-4 py-3 text-[13px] text-[var(--ink-2)]">
          Not verified. The sandbox run failed: {proof.message}
        </p>
      </div>
    )
  }

  const { before, after, passed } = proof.proof

  if (!passed) {
    return (
      <div className="mt-6">
        <div className="micro">Sandbox proof</div>
        <div className="mt-3 border border-[var(--line-strong)] px-4 py-3">
          <p className="text-[13px] font-semibold text-[var(--ink)]">Verification did not pass.</p>
          <pre className="mono mt-3 max-h-24 overflow-auto whitespace-pre-wrap text-[11px] leading-snug text-[var(--ink-3)]">
            {before === after ? before : `${before}\n${after}`}
          </pre>
        </div>
      </div>
    )
  }

  return (
    <div className="mt-6">
      <div className="micro">Sandbox proof · Daytona · live Stripe API</div>
      <div className="mt-3 border-l border-[var(--line-strong)] pl-4">
        <p className="mono text-[12.5px] text-[var(--ink-3)] line-through">{before}</p>
        <p className="mono mt-1 text-[12.5px] text-[var(--ink)]">{after}</p>
        <p className="prose-line mt-3 text-[12px] text-[var(--ink-3)]">
          Shared accessor proof: one sandbox run of the migrated accessor, not a per-line execution.
        </p>
      </div>
    </div>
  )
}
