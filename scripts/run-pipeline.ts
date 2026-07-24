import { loadBreakingChanges } from '../lib/detect'
import { TARGET_REPOS } from '../lib/repos'
import { ensureCloned } from '../lib/workspace'
import { scanRepo } from '../lib/scan'
import { generatePatch } from '../lib/patch'
import { usage, FIREWORKS_PRICE_PER_M } from '../lib/fireworks'

async function main() {
  const start = Date.now()
  const changes = loadBreakingChanges()
  const change = changes.find((c) => c.field === 'current_period_end')
  if (!change) throw new Error('current_period_end breaking change not found in spec-diff.json')

  console.log(`Breaking change: ${change.oldAccessor} -> ${change.newAccessor}\n`)

  for (const repo of TARGET_REPOS) {
    console.log(`Cloning ${repo.name}...`)
    await ensureCloned(repo)
  }

  // Every repo scan and every patch is independent, so the whole run fans out at once and
  // is reported afterwards in repo order. Each repo starts patching as soon as its own scan
  // lands, so patch calls overlap the scans still running. The shared Fireworks slot limit
  // bounds the total burst.
  const runs = await Promise.all(
    TARGET_REPOS.map(async (repo) => {
      const result = await scanRepo(repo, change)
      const patches = await Promise.all(
        result.hits.map((hit) => (hit.genuine ? generatePatch(hit, change) : null))
      )
      return { result, patches }
    })
  )

  for (const { result, patches } of runs) {
    console.log(`\n=== ${result.repo.name} (${result.repo.id}) ===`)
    if (result.hits.length === 0) {
      console.log('  no candidates found')
      continue
    }
    result.hits.forEach((hit, hitIndex) => {
      const verdict = hit.genuine ? 'GENUINE' : 'FALSE POSITIVE'
      console.log(`  [${verdict}] ${hit.file}:${hit.line}`)
      console.log(`    line:   ${hit.text.trim()}`)
      console.log(`    reason: ${hit.reason}`)

      const patch = patches[hitIndex]
      if (patch) {
        console.log(`    before: ${patch.before.trim()}`)
        console.log(`    after:  ${patch.after.trim()}`)
      }
    })
  }

  const elapsedSec = (Date.now() - start) / 1000
  const cost =
    (usage.promptTokens / 1_000_000) * FIREWORKS_PRICE_PER_M.input +
    (usage.completionTokens / 1_000_000) * FIREWORKS_PRICE_PER_M.output
  console.log(`\n=== summary ===`)
  console.log(`  repos scanned:   ${TARGET_REPOS.length}`)
  console.log(`  wall clock:      ${elapsedSec.toFixed(1)}s`)
  console.log(`  fireworks calls: ${usage.calls} (${usage.promptTokens} prompt tok, ${usage.completionTokens} completion tok)`)
  console.log(`  fireworks cost:  $${cost.toFixed(5)} total, $${(cost / TARGET_REPOS.length).toFixed(5)} per repo`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
