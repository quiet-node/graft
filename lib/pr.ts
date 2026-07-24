import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import type { TargetRepo } from './types'
import type { ScanHit } from './scan'
import type { Proof } from './verify'

export type PatchedHit = {
  hit: ScanHit
  patch?: { before: string; after: string }
}

const BRANCH_BASE_NAME = 'graft/stripe-basil-current-period-end'
const STRIPE_TARGET_RANGE = '^18.0.0'
const STRIPE_API_VERSION = '2025-03-31.basil'
const CHANGELOG_URL =
  'https://docs.stripe.com/changelog/basil/2025-03-31/deprecate-subscription-current-period-start-and-end'
const COMMIT_TITLE = 'fix: migrate current_period_end to SubscriptionItem for Stripe Basil'
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage', '.cache'])

function run(cwd: string, cmd: string, args: string[]): string {
  try {
    return execFileSync(cmd, args, { cwd, encoding: 'utf8' }).trim()
  } catch (err) {
    const stderr = (err as { stderr?: string }).stderr
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(stderr ? `${message}\n${stderr}` : message)
  }
}

function defaultBranch(cwd: string): string {
  try {
    const ref = run(cwd, 'git', ['symbolic-ref', 'refs/remotes/origin/HEAD'])
    return ref.replace('refs/remotes/origin/', '')
  } catch {
    const out = run(cwd, 'git', ['remote', 'show', 'origin'])
    const match = /HEAD branch:\s*(\S+)/.exec(out)
    if (!match) throw new Error(`could not detect default branch in ${cwd}`)
    return match[1]
  }
}

function branchExists(cwd: string, name: string): boolean {
  try {
    run(cwd, 'git', ['rev-parse', '--verify', '--quiet', name])
    return true
  } catch {
    // no local branch with that name
  }
  try {
    const out = run(cwd, 'git', ['ls-remote', '--heads', 'origin', name])
    return out.length > 0
  } catch {
    return false
  }
}

function uniqueBranchName(cwd: string): string {
  if (!branchExists(cwd, BRANCH_BASE_NAME)) return BRANCH_BASE_NAME
  for (let i = 2; i < 1000; i++) {
    const candidate = `${BRANCH_BASE_NAME}-${i}`
    if (!branchExists(cwd, candidate)) return candidate
  }
  throw new Error(`exhausted suffixes looking for a free branch name in ${cwd}`)
}

function forkNameWithOwner(forkUrl: string): string {
  const match = /github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/.exec(forkUrl)
  if (!match) throw new Error(`could not parse owner/name from fork url: ${forkUrl}`)
  return `${match[1]}/${match[2]}`
}

type ApplyOutcome = { hit: ScanHit; applied: boolean; reason: string }

function applyPatch(cwd: string, hit: ScanHit, patch: { before: string; after: string }): ApplyOutcome {
  const absPath = join(cwd, hit.file)
  if (!existsSync(absPath)) {
    return { hit, applied: false, reason: `file not found: ${hit.file}` }
  }
  const content = readFileSync(absPath, 'utf8')
  const lines = content.split('\n')
  const idx = hit.line - 1
  if (idx < 0 || idx >= lines.length) {
    return { hit, applied: false, reason: `line ${hit.line} out of range in ${hit.file}` }
  }
  if (lines[idx] !== patch.before) {
    return {
      hit,
      applied: false,
      reason: `line ${hit.line} in ${hit.file} no longer matches recorded before-text, skipped to avoid corrupting the file`,
    }
  }
  lines[idx] = patch.after
  writeFileSync(absPath, lines.join('\n'))
  return { hit, applied: true, reason: 'patched' }
}

function findPackageJsonWithStripe(rootDir: string): string | null {
  const stack = [rootDir]
  while (stack.length) {
    const dir = stack.pop()!
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) stack.push(full)
        continue
      }
      if (entry.name === 'package.json') {
        const content = readFileSync(full, 'utf8')
        if (/"stripe"\s*:/.test(content)) return full
      }
    }
  }
  return null
}

function bumpStripeDependency(cwd: string): string | null {
  const pkgPath = findPackageJsonWithStripe(cwd)
  if (!pkgPath) return null
  const content = readFileSync(pkgPath, 'utf8')
  const updated = content.replace(/("stripe"\s*:\s*")[^"]*(")/, `$1${STRIPE_TARGET_RANGE}$2`)
  if (updated === content) return null // already at or past target range, nothing to change
  writeFileSync(pkgPath, updated)
  return relative(cwd, pkgPath)
}

function buildBody(
  repo: TargetRepo,
  applied: ApplyOutcome[],
  skipped: ApplyOutcome[],
  rejected: ScanHit[],
  stripeBump: string | null,
  proof: Proof
): string {
  const lines: string[] = []

  lines.push(
    `Stripe removed \`Subscription.current_period_end\` (and \`current_period_start\`) in API version ` +
      `\`${STRIPE_API_VERSION}\`. The value now lives on the subscription's first item instead, read as ` +
      `\`items.data[0].current_period_end\`. Details: ${CHANGELOG_URL}`
  )
  lines.push('')
  lines.push(
    `Graft scanned ${repo.name} for reads of \`current_period_end\` off a real Stripe Subscription, traced ` +
      `each one back to where the value came from, and patched only the reads that actually break under the ` +
      `new API version.`
  )
  lines.push('')

  if (applied.length) {
    lines.push('## Patched lines')
    lines.push('')
    lines.push('| File | Line | Provenance |')
    lines.push('| --- | --- | --- |')
    for (const { hit } of applied) {
      const provenance = (hit.provenance ?? 'not traced').replace(/\|/g, '\\|')
      lines.push(`| \`${hit.file}\` | ${hit.line} | ${provenance} |`)
    }
    lines.push('')
  } else {
    lines.push('## Patched lines')
    lines.push('')
    lines.push('No lines were patched in this repo.')
    lines.push('')
  }

  const notPatched = [
    ...rejected.map((hit) => ({ file: hit.file, line: hit.line, reason: hit.reason })),
    ...skipped.map((s) => ({ file: s.hit.file, line: s.hit.line, reason: s.reason })),
  ]
  if (notPatched.length) {
    lines.push('## Lines Graft left alone, and why')
    lines.push('')
    lines.push(
      `These lines also matched the flagged field but were judged not to be genuine breakage, or could not ` +
        `be safely patched.`
    )
    lines.push('')
    lines.push('| File | Line | Reason |')
    lines.push('| --- | --- | --- |')
    for (const item of notPatched) {
      const reason = item.reason.replace(/\|/g, '\\|')
      lines.push(`| \`${item.file}\` | ${item.line} | ${reason} |`)
    }
    lines.push('')
  }

  if (stripeBump) {
    lines.push('## Dependency bump')
    lines.push('')
    lines.push(`\`${stripeBump}\` now pins \`stripe\` to \`${STRIPE_TARGET_RANGE}\`, past the Basil boundary.`)
    lines.push('')
  }

  lines.push('## Sandbox proof')
  lines.push('')
  if (proof.passed) {
    lines.push(
      `Verified in a live sandbox against a real Stripe test subscription under API version \`${STRIPE_API_VERSION}\`.`
    )
    lines.push('')
    lines.push(`Before: \`${proof.before}\``)
    lines.push('')
    lines.push(`After: \`${proof.after}\``)
    lines.push('')
    lines.push('Result: passed. The old accessor is gone and the new accessor returns the value.')
  } else {
    const didNotRun = proof.before.includes('verification not run')
    lines.push(didNotRun ? 'Verification did not run.' : 'Verification ran but did not pass.')
    lines.push('')
    lines.push(`Before: \`${proof.before}\``)
    lines.push('')
    lines.push(`After: \`${proof.after}\``)
    lines.push('')
    lines.push(
      'This PR carries the patch without a confirmed passing sandbox run. Treat the fix as unverified until that changes.'
    )
  }

  return lines.join('\n')
}

export async function openPullRequest(
  repo: TargetRepo,
  hits: PatchedHit[],
  proof: Proof
): Promise<{ url: string }> {
  const cwd = resolve(repo.localPath)
  if (!existsSync(cwd)) throw new Error(`local clone not found at ${cwd}`)

  const base = defaultBranch(cwd)
  run(cwd, 'git', ['checkout', base])

  const branch = uniqueBranchName(cwd)
  run(cwd, 'git', ['checkout', '-b', branch])

  const rejected = hits.filter((h) => !h.hit.genuine).map((h) => h.hit)
  const genuineWithoutPatch = hits.filter((h) => h.hit.genuine && !h.patch).map((h) => h.hit)
  const genuineNoOpPatch = hits.filter((h) => h.hit.genuine && h.patch && h.patch.after === h.patch.before)
  const genuineWithPatch = hits.filter((h) => h.hit.genuine && h.patch && h.patch.after !== h.patch.before)

  const outcomes = genuineWithPatch.map((h) => applyPatch(cwd, h.hit, h.patch!))
  const applied = outcomes.filter((o) => o.applied)
  const skipped = [
    ...outcomes.filter((o) => !o.applied),
    ...genuineWithoutPatch.map((hit) => ({ hit, applied: false, reason: 'no patch was generated for this hit' })),
    ...genuineNoOpPatch.map((h) => ({
      hit: h.hit,
      applied: false,
      reason: 'patch generator returned the line unchanged',
    })),
  ]

  const stripeBump = bumpStripeDependency(cwd)

  const touched = [...applied.map((o) => o.hit.file), ...(stripeBump ? [stripeBump] : [])]
  if (touched.length === 0) {
    throw new Error(`nothing to commit in ${repo.id}: no patch applied and no stripe dependency found`)
  }

  run(cwd, 'git', ['add', ...touched])
  run(cwd, 'git', ['commit', '-s', '-m', COMMIT_TITLE])
  run(cwd, 'git', ['push', '-u', 'origin', branch])

  const body = buildBody(repo, applied, skipped, rejected, stripeBump, proof)

  const repoSlug = forkNameWithOwner(repo.forkUrl)
  let out: string
  try {
    out = execFileSync(
      'gh',
      [
        'pr',
        'create',
        '--repo', repoSlug,
        '--base', base,
        '--head', branch,
        '--title', COMMIT_TITLE,
        '--body', body,
      ],
      { cwd, encoding: 'utf8' }
    ).trim()
  } catch (err) {
    const stderr = (err as { stderr?: string }).stderr
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(stderr ? `gh pr create failed: ${message}\n${stderr}` : `gh pr create failed: ${message}`)
  } finally {
    // Leave the clone back on its default branch so a later scan of this repo does not
    // see already-migrated source and report zero genuine hits.
    run(cwd, 'git', ['checkout', base])
  }

  const urlLine = out.split('\n').find((line) => line.startsWith('https://'))
  if (!urlLine) throw new Error(`gh pr create did not return a URL, got: ${out}`)

  return { url: urlLine.trim() }
}
