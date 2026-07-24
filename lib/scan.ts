import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import type { BreakingChange, TargetRepo } from './types'
import { fireworks, FIREWORKS_MODEL, recordUsage } from './fireworks'

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage', '.cache'])
const LOCKFILES = new Set(['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'composer.lock'])
const MAX_FILE_BYTES = 1_000_000
const MAX_PROVENANCE_LINES = 70
const MAX_TRACED_IDENTIFIERS = 12
const MAX_CALL_SITES = 6

// Model calls are independent per candidate, so they run concurrently. The cap keeps the
// burst below the Fireworks rate limit; the per-call timeout stops one hung request from
// holding the whole run open.
const FIREWORKS_CONCURRENCY = 12
// Healthy calls land in single-digit seconds, so a call still open at 15s is sick rather than
// slow: failing it fast and retrying once beats waiting out a hung connection.
const CLASSIFIER_TIMEOUT_MS = 15_000
const CLASSIFIER_MAX_RETRIES = 1

// Marks a hit whose classification call never completed, so a degraded hit can never be
// read as a real "not a Stripe object" verdict.
export const CLASSIFIER_ERROR_PREFIX = 'classifier call failed:'

let active = 0
const waiting: (() => void)[] = []

// Process-wide cap on in-flight Fireworks calls, shared by classification and patching, so
// the total stays under the limit however many repos are being scanned at once. A finished
// call hands its slot straight to the next waiter rather than releasing it into a race.
export async function withFireworksSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (active < FIREWORKS_CONCURRENCY) active++
  else await new Promise<void>((resolve) => waiting.push(resolve))
  try {
    return await fn()
  } finally {
    const next = waiting.shift()
    if (next) next()
    else active--
  }
}

export type ScanHit = {
  file: string
  line: number
  text: string
  genuine: boolean
  reason: string
  provenance?: string
  // Set when the classifier call never produced a judgement (timeout, transport error, or
  // unparseable response). Such a hit is neither genuine nor rejected: nothing was decided.
  classifierFailed?: true
}

export type ScanResult = {
  repo: TargetRepo
  hits: ScanHit[]
}

type Candidate = {
  absPath: string
  relPath: string
  line: number
  text: string
}

function walk(dir: string, out: string[]) {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      walk(join(dir, entry.name), out)
      continue
    }
    if (LOCKFILES.has(entry.name)) continue
    if (entry.name.includes('.min.')) continue
    out.push(join(dir, entry.name))
  }
}

function readTextFile(absPath: string): string | null {
  try {
    const buf = readFileSync(absPath)
    if (buf.length > MAX_FILE_BYTES) return null
    if (buf.includes(0)) return null // binary
    return buf.toString('utf8')
  } catch {
    return null
  }
}

function findCandidates(files: string[], repo: TargetRepo, field: string): Candidate[] {
  const candidates: Candidate[] = []
  for (const absPath of files) {
    const content = readTextFile(absPath)
    if (content === null) continue
    content.split('\n').forEach((text, idx) => {
      if (text.includes(field)) {
        candidates.push({ absPath, relPath: relative(repo.localPath, absPath), line: idx + 1, text })
      }
    })
  }
  return candidates
}

// Member chain that the flagged field is read from, e.g. "data" in `data.current_period_end`
// or "subscription.data()" in `subscription.data().current_period_end`. Empty when the field
// appears as bare text (a SQL column, a string literal, an object key).
export function baseExpressions(text: string, field: string): string[] {
  const chain = /([A-Za-z_$][\w$]*(?:\s*\??\.\s*[A-Za-z_$][\w$]*(?:\(\s*\))?)*)\s*\??\.\s*$/
  const found: string[] = []
  let from = 0
  for (;;) {
    const at = text.indexOf(field, from)
    if (at === -1) break
    from = at + field.length
    const match = chain.exec(text.slice(0, at))
    if (match && !found.includes(match[1])) found.push(match[1])
  }
  return found
}

function rootIdentifier(expr: string): string {
  return expr.split(/[.?(]/)[0].trim()
}

function bindingPatterns(id: string): RegExp[] {
  return [
    new RegExp(`\\b(?:const|let|var)\\s+[^=]*\\b${id}\\b[^=]*=`),
    new RegExp(`\\bfunction\\s*[\\w$]*\\s*\\([^)]*\\b${id}\\b`),
    new RegExp(`\\([^)]*\\b${id}\\b[^)]*\\)\\s*=>`),
    new RegExp(`\\b${id}\\s*=>`),
    new RegExp(`\\b${id}\\s*=[^=>]`),
    new RegExp(`\\bcatch\\s*\\(\\s*${id}\\b`),
  ]
}

// Name of the function that takes `id` as a parameter on this line, so callers can be traced.
function paramOwner(line: string, id: string): string | null {
  if (!new RegExp(`\\([^)]*\\b${id}\\b[^)]*\\)`).test(line)) return null
  const named = /\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/.exec(line)
  if (named) return named[1]
  const assigned = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?(?:function\b|\()/.exec(line)
  if (assigned) return assigned[1]
  return null
}

const KEYWORDS = new Set([
  'const', 'let', 'var', 'function', 'return', 'await', 'async', 'new', 'if', 'else', 'for', 'while',
  'switch', 'case', 'break', 'continue', 'try', 'catch', 'throw', 'typeof', 'this', 'null', 'undefined',
  'true', 'false', 'import', 'export', 'from', 'default', 'class', 'extends', 'of', 'in', 'delete', 'void',
])

function identifiersIn(text: string, field: string): string[] {
  const out: string[] = []
  for (const match of text.matchAll(/[A-Za-z_$][\w$]*/g)) {
    const id = match[0]
    if (id === field || KEYWORDS.has(id) || out.includes(id)) continue
    out.push(id)
  }
  return out
}

function indentOf(line: string): number {
  return line.length - line.trimStart().length
}

type Provenance = { baseExprs: string[]; body: string; callSites: string[] }

function collectProvenance(
  candidate: Candidate,
  field: string,
  repo: TargetRepo,
  files: string[]
): Provenance {
  const content = readTextFile(candidate.absPath) ?? ''
  const lines = content.split('\n')
  const hitIdx = candidate.line - 1
  const picked = new Set<number>()
  const add = (idx: number) => {
    if (idx >= 0 && idx < lines.length && lines[idx].trim() && picked.size < MAX_PROVENANCE_LINES) {
      picked.add(idx)
    }
  }

  // 1. The flagged line plus a small window around it.
  for (let i = hitIdx - 4; i <= hitIdx + 3; i++) add(i)

  // 2. Structural spine: every enclosing block header above the hit, by decreasing indentation.
  let minIndent = indentOf(lines[hitIdx] ?? '')
  for (let i = hitIdx - 1; i >= 0 && minIndent > 0; i--) {
    if (!lines[i].trim()) continue
    const indent = indentOf(lines[i])
    if (indent < minIndent) {
      add(i)
      minIndent = indent
    }
  }

  // 3. Imports and requires, which name the library each value ultimately comes from.
  for (let i = 0; i < Math.min(lines.length, 40); i++) {
    if (/^\s*import\b/.test(lines[i]) || /\brequire\s*\(/.test(lines[i])) add(i)
  }

  // 4. Where the traced identifiers are bound, two hops deep so a value can be followed
  //    through an intermediate variable back to the call that produced it.
  const baseExprs = baseExpressions(candidate.text, field)
  const seeds = baseExprs.length ? baseExprs.map(rootIdentifier) : identifiersIn(candidate.text, field)
  const traced: string[] = []
  const callSites: string[] = []
  let frontier = seeds.slice(0, MAX_TRACED_IDENTIFIERS)
  for (let hop = 0; hop < 2 && frontier.length; hop++) {
    const next: string[] = []
    for (const id of frontier) {
      if (traced.includes(id) || traced.length >= MAX_TRACED_IDENTIFIERS) continue
      traced.push(id)
      const patterns = bindingPatterns(id)
      for (let i = 0; i < lines.length; i++) {
        if (i === hitIdx || !patterns.some((p) => p.test(lines[i]))) continue
        add(i)
        add(i + 1)
        add(i + 2)
        for (const nested of identifiersIn(lines[i], field)) {
          if (!traced.includes(nested) && !next.includes(nested)) next.push(nested)
        }
        const owner = paramOwner(lines[i], id)
        if (owner) collectCallSites(owner, candidate.absPath, files, repo, callSites)
      }
    }
    frontier = next
  }

  const ordered = [...picked].sort((a, b) => a - b)
  const rendered: string[] = []
  let previous = -1
  for (const idx of ordered) {
    if (previous !== -1 && idx > previous + 1) rendered.push('   ...')
    rendered.push(`${idx === hitIdx ? '>' : ' '} ${idx + 1} | ${lines[idx]}`)
    previous = idx
  }
  return { baseExprs, body: rendered.join('\n'), callSites }
}

// A bare function parameter carries no local evidence, so the decisive line is usually the
// caller, often in another file (a webhook router, for example).
function collectCallSites(
  fnName: string,
  selfPath: string,
  files: string[],
  repo: TargetRepo,
  out: string[]
) {
  if (out.length >= MAX_CALL_SITES) return
  const reference = new RegExp(`\\b${fnName}\\b`)
  for (const absPath of files) {
    if (absPath === selfPath) continue
    const content = readTextFile(absPath)
    if (content === null || !reference.test(content)) continue
    content.split('\n').forEach((text, idx) => {
      if (!reference.test(text) || out.length >= MAX_CALL_SITES) return
      out.push(`${relative(repo.localPath, absPath)}:${idx + 1} | ${text.trim()}`)
    })
  }
}

async function classify(
  candidate: Candidate,
  change: BreakingChange,
  repo: TargetRepo,
  files: string[]
): Promise<{ genuine: boolean; reason: string; provenance: string; classifierFailed?: true }> {
  const { baseExprs, body, callSites } = collectProvenance(candidate, change.field, repo, files)
  const system =
    `Stripe removed "${change.field}" from the Subscription object; it moved to "${change.movedTo}", ` +
    `accessed as "${change.newAccessor}" instead of "${change.oldAccessor}". Code that still reads the old ` +
    `accessor off a real Stripe Subscription is broken and must be patched.\n\n` +
    `You decide one thing about the flagged line: genuine=true when the base expression it reads ` +
    `"${change.field}" from is a Stripe Subscription that came from the Stripe API, and the line still uses ` +
    `the old direct accessor. Both parts must hold. The field being removed is the bug you are looking for, ` +
    `never a reason to answer false. A wrong "genuine" verdict rewrites working code into code that crashes, ` +
    `so judge where the value came from, never how the line looks.\n\n` +
    `Trace the base expression named in the prompt back to whatever produced it. The provenance lines give ` +
    `you the enclosing scope, the imports, the lines that bind each identifier, and any call sites of the ` +
    `enclosing function. Follow the chain: the flagged expression, then the variable it reads from, then the ` +
    `call or parameter that variable came from.\n\n` +
    `The value is NOT a Stripe Subscription when it originates from a database or ORM query (Knex, Prisma, ` +
    `Sequelize, Mongoose, better-sqlite3, raw SQL), a Redux or React state selector or hook, a Firestore or ` +
    `other document snapshot, a local cache, an HTTP request body, or a plain object literal. Rows and ` +
    `documents keep Stripe field names because they were copied from Stripe earlier; that does not make them ` +
    `Stripe objects.\n\n` +
    `The value IS a Stripe Subscription only when it traces to a Stripe SDK call (stripe.subscriptions.*, ` +
    `stripe.checkout.*, any client built from the stripe package) or to a Stripe webhook event object such as ` +
    `event.data.object.\n\n` +
    `Answer genuine=false when the field is a SQL column, a migration, a string literal, or an object key ` +
    `rather than a property read; when the line already reads the field through ".items.data" so it is ` +
    `migrated; and whenever the trace does not clearly reach Stripe. Missing a genuine hit is a small ` +
    `failure. A confident wrong patch is a large one. When the evidence runs out, answer genuine=false.\n\n` +
    `Answer genuine=true when the trace reaches a Stripe SDK call or webhook event, even though the field no ` +
    `longer exists on that object. That combination is precisely the breakage being fixed.\n\n` +
    `Respond with strict JSON only, in this key order: ` +
    `{"provenance": string, "genuine": boolean, "reason": string}. ` +
    `"provenance" is the origin of the value in under 10 words, quoting only code that appears in the ` +
    `provenance lines, e.g. "db('subscriptions') via Knex", "stripe.subscriptions.retrieve()", ` +
    `"Redux selector over Firestore state", or "unresolved: no binding found". When there is no base ` +
    `expression, describe what the text is instead of inventing a call, e.g. "SQL column name in a query ` +
    `string" or "column name in a migration". ` +
    `"reason" is a dashboard phrase under 12 words that names that origin, e.g. ` +
    `"Knex database row, not a Stripe Subscription object" or "SQL column definition, not API usage".`

  const user =
    `File: ${candidate.relPath}\n` +
    `Flagged line ${candidate.line}: ${candidate.text}\n` +
    `Base expression to trace: ${baseExprs.length ? baseExprs.join(', ') : '(none: the field is not read off an expression)'}\n\n` +
    `Provenance lines from ${candidate.relPath} ("..." marks skipped lines, ">" marks the flagged line):\n${body}` +
    (callSites.length
      ? `\n\nCall sites elsewhere in the repo:\n${callSites.join('\n')}`
      : '')

  let res
  try {
    res = await withFireworksSlot(() =>
      fireworks.chat.completions.create(
        {
          model: FIREWORKS_MODEL,
          temperature: 0,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        },
        { timeout: CLASSIFIER_TIMEOUT_MS, maxRetries: CLASSIFIER_MAX_RETRIES }
      )
    )
  } catch (err) {
    // One failed call degrades its own candidate and leaves the rest of the run intact.
    // The error is named in the verdict so it can never read as a real false positive.
    const message = err instanceof Error ? err.message : String(err)
    return {
      genuine: false,
      classifierFailed: true,
      reason: `${CLASSIFIER_ERROR_PREFIX} ${message}`,
      provenance: `${CLASSIFIER_ERROR_PREFIX} ${message}`,
    }
  }

  recordUsage(res)
  const raw = res.choices[0]?.message?.content ?? '{}'
  try {
    const parsed = JSON.parse(raw)
    return {
      genuine: Boolean(parsed.genuine),
      reason: String(parsed.reason ?? 'no reason given'),
      provenance: String(parsed.provenance ?? 'no trace given'),
    }
  } catch {
    // Same class of failure as a dead call: the model answered, but nothing decodable came
    // back, so no verdict was reached on this line.
    return {
      genuine: false,
      classifierFailed: true,
      reason: `classifier returned invalid JSON: ${raw.slice(0, 100)}`,
      provenance: 'unresolved: classifier returned invalid JSON',
    }
  }
}

export async function scanRepo(repo: TargetRepo, change: BreakingChange): Promise<ScanResult> {
  const files: string[] = []
  walk(repo.localPath, files)
  const candidates = findCandidates(files, repo, change.field)
  const hits = await Promise.all(
    candidates.map(async (candidate): Promise<ScanHit> => {
      const { genuine, reason, provenance, classifierFailed } = await classify(candidate, change, repo, files)
      return {
        file: candidate.relPath,
        line: candidate.line,
        text: candidate.text,
        genuine,
        reason,
        provenance,
        ...(classifierFailed && { classifierFailed }),
      }
    })
  )
  return { repo, hits }
}
