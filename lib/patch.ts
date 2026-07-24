import type { BreakingChange } from './types'
import { baseExpressions, type ScanHit } from './scan'
import { fireworks, FIREWORKS_MODEL, recordUsage } from './fireworks'

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

  const res = await fireworks.chat.completions.create({
    model: FIREWORKS_MODEL,
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  })

  recordUsage(res)
  const raw = res.choices[0]?.message?.content ?? '{}'
  let after = hit.text
  try {
    const parsed = JSON.parse(raw)
    if (typeof parsed.after === 'string') after = parsed.after
  } catch {
    // fall back to original line unchanged if the model returns invalid JSON
  }

  return { before: hit.text, after }
}
