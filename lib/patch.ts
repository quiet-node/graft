import type { BreakingChange } from './types'
import { baseExpressions, withFireworksSlot, type ScanHit } from './scan'
import { fireworks, FIREWORKS_MODEL, recordUsage } from './fireworks'

// Matches the classifier budget: fail a sick call fast and let the single retry cover it,
// while staying well inside the caller's own per-patch timeout in app/api/run/route.ts.
const PATCH_TIMEOUT_MS = 15_000
const PATCH_MAX_RETRIES = 1

// The model owns the code on the line, not its layout. Any trailing newline it adds and any
// leading whitespace it invents is dropped, and the original line's own indentation is copied
// back verbatim, tabs or spaces alike. Trailing and interior whitespace are left exactly as
// the model returned them.
function normalizeAfter(before: string, modelAfter: string): string {
  const line = modelAfter.replace(/[\r\n]+$/, '')
  // A multi-line answer would insert lines into the file and shift every line number after
  // it, so the line is left unpatched instead.
  if (line.includes('\n')) return before
  const body = line.trimStart()
  if (!body) return before
  const indent = before.slice(0, before.length - before.trimStart().length)
  return indent + body
}

export async function generatePatch(
  hit: ScanHit,
  change: BreakingChange
): Promise<{ before: string; after: string }> {
  const targets = baseExpressions(hit.text, change.field)
  const system =
    `You rewrite a single line of source code to fix a deprecated Stripe API accessor. ` +
    `Rewrite only the property reads listed as targets, turning "<target>.${change.field}" into ` +
    `"<target>.items.data[0].${change.field}". ` +
    `Leave every other occurrence of "${change.field}" on the line untouched: object keys, string literals, ` +
    `SQL column names, and any base expression not in the target list are not Stripe Subscription reads, and ` +
    `rewriting them breaks working code. On a line such as ` +
    `"current_period_end: subscription.${change.field}," only the value on the right of the colon changes. ` +
    `Preserve indentation, quoting, spacing, optional chaining, and the rest of the expression structure ` +
    `exactly as given. If no target applies, return the line unchanged. ` +
    `Respond with strict JSON only: {"after": "<rewritten line, no trailing newline>"}.`
  const user =
    `Line: ${hit.text}\n` +
    `Targets to rewrite: ${targets.length ? targets.join(', ') : '(none)'}\n` +
    `Origin of those targets: ${hit.provenance ?? 'not traced'}`

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
        { timeout: PATCH_TIMEOUT_MS, maxRetries: PATCH_MAX_RETRIES }
      )
    )
  } catch {
    // A failed call leaves this line unpatched rather than ending the run.
    return { before: hit.text, after: hit.text }
  }

  recordUsage(res)
  const raw = res.choices[0]?.message?.content ?? '{}'
  let after = hit.text
  try {
    const parsed = JSON.parse(raw)
    if (typeof parsed.after === 'string') after = normalizeAfter(hit.text, parsed.after)
  } catch {
    // fall back to original line unchanged if the model returns invalid JSON
  }

  return { before: hit.text, after }
}
