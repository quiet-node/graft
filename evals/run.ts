import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env.local' })

if (!process.env.BRAINTRUST_API_KEY) {
  console.error('BRAINTRUST_API_KEY is not set. Add it to .env.local, then rerun npm run eval.')
  process.exit(1)
}

// Dynamic imports below: lib/fireworks.ts constructs its client at module-evaluation time,
// and lib/scan.ts/lib/patch.ts import it transitively. A static import would run before the
// dotenv load above (ES module evaluation order), so it is deferred until after env is loaded
// and the key check above has passed.
async function main() {
  const { Eval } = await import('braintrust')
  const { loadBreakingChanges } = await import('../lib/detect')
  const { scanRepo } = await import('../lib/scan')
  const { generatePatch } = await import('../lib/patch')
  const { EVAL_REPOS, CASES } = await import('./dataset')
  const { verdictAccuracy, patchCorrectness } = await import('./scorers')
  type ScanHit = Awaited<ReturnType<typeof scanRepo>>['hits'][number]
  type EvalCase = (typeof CASES)[number]
  type TaskOutput = {
    verdict: 'genuine' | 'false-positive' | 'not-found'
    reason: string
    provenance: string
    patchAfter: string | null
  }

  const changes = loadBreakingChanges()
  const change = changes.find((c) => c.field === 'current_period_end')
  if (!change) throw new Error('current_period_end breaking change not found in data/spec-diff.json')

  const hits = new Map<string, ScanHit>()
  for (const repo of EVAL_REPOS) {
    console.log(`Scanning ${repo.id}...`)
    const result = await scanRepo(repo, change)
    for (const hit of result.hits) {
      hits.set(`${repo.id}::${hit.file}::${hit.line}`, hit)
    }
  }

  const missing = CASES.filter((c) => !hits.has(`${c.repoId}::${c.file}::${c.line}`))
  if (missing.length) {
    console.error('These ground-truth lines were not found by the scanner (check dataset.ts line numbers):')
    for (const m of missing) console.error(`  ${m.id}: ${m.repoId}/${m.file}:${m.line}`)
  }

  // Patch each genuine hit once, cached by the same key as hits, so the console diagnostics
  // below and the Eval task share one generatePatch call per line instead of duplicating it.
  const patches = new Map<string, string>()
  for (const [key, hit] of hits) {
    if (!hit.genuine) continue
    patches.set(key, (await generatePatch(hit, change)).after)
  }

  console.log('\n=== verdict + patch diagnostics ===')
  for (const c of CASES) {
    const key = `${c.repoId}::${c.file}::${c.line}`
    const hit = hits.get(key)
    if (!hit) continue
    const predicted = hit.genuine ? 'genuine' : 'false-positive'
    const verdictOk = predicted === c.expectedVerdict
    let patchLine = ''
    if (c.expectedVerdict === 'genuine' && c.expectedPatchAfter) {
      const after = patches.get(key) ?? null
      const patchOk = after === c.expectedPatchAfter
      patchLine = after === null ? ' | patch: n/a (missed genuine)' : ` | patch: ${patchOk ? 'OK' : 'MISMATCH'}`
      if (!patchOk && after !== null) patchLine += `\n    expected: ${JSON.stringify(c.expectedPatchAfter)}\n    got:      ${JSON.stringify(after)}`
    } else if (hit.genuine) {
      // Predicted genuine but either the ground truth expects false-positive (a false
      // GENUINE, the dangerous error class) or there is no expectedPatchAfter to check
      // against (e.g. the destructure case). Show what the patcher actually emitted either way.
      patchLine = ` | patch emitted: ${JSON.stringify(patches.get(key) ?? null)}`
    }
    console.log(`${verdictOk ? 'OK  ' : 'FAIL'} ${c.id}: expected=${c.expectedVerdict} got=${predicted}${patchLine}`)
  }
  console.log('===\n')

  await Eval<EvalCase, TaskOutput, EvalCase>('graft-stripe-classifier', {
    data: () => CASES.map((c) => ({ input: c, expected: c })),
    task: async (input): Promise<TaskOutput> => {
      const key = `${input.repoId}::${input.file}::${input.line}`
      const hit = hits.get(key)
      if (!hit) {
        return { verdict: 'not-found', reason: 'no scan hit at this file:line', provenance: 'unresolved', patchAfter: null }
      }
      return {
        verdict: hit.genuine ? 'genuine' : 'false-positive',
        reason: hit.reason,
        provenance: hit.provenance ?? 'unresolved',
        patchAfter: hit.genuine ? patches.get(key) ?? null : null,
      }
    },
    scores: [verdictAccuracy, patchCorrectness],
  })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
