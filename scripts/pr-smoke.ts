import type { PatchedHit } from '../lib/pr'

const REPO_ID = 'chatbotkit'

async function main() {
  // Loaded via dynamic import, before any other lib module, so process.env is populated
  // from .env.local before lib/fireworks.ts reads FIREWORKS_API_KEY at its own module load.
  const { config } = await import('dotenv')
  config({ path: '.env.local' })

  const { loadBreakingChanges } = await import('../lib/detect')
  const { TARGET_REPOS } = await import('../lib/repos')
  const { ensureCloned } = await import('../lib/workspace')
  const { scanRepo } = await import('../lib/scan')
  const { generatePatch } = await import('../lib/patch')
  const { verifyPatch } = await import('../lib/verify')
  const { openPullRequest } = await import('../lib/pr')

  const start = Date.now()
  const changes = loadBreakingChanges()
  const change = changes.find((c) => c.field === 'current_period_end')
  if (!change) throw new Error('current_period_end breaking change not found in spec-diff.json')

  const repo = TARGET_REPOS.find((r) => r.id === REPO_ID)
  if (!repo) throw new Error(`repo ${REPO_ID} not found in TARGET_REPOS`)

  await ensureCloned(repo)

  console.log(`Scanning ${repo.name}...`)
  const result = await scanRepo(repo, change)

  const hits: PatchedHit[] = []
  let firstGenuineHit = null as (typeof result.hits)[number] | null
  for (const hit of result.hits) {
    if (!hit.genuine) {
      hits.push({ hit })
      continue
    }
    const patch = await generatePatch(hit, change)
    hits.push({ hit, patch })
    if (!firstGenuineHit) firstGenuineHit = hit
  }

  const genuineCount = hits.filter((h) => h.hit.genuine).length
  console.log(`  ${genuineCount} genuine hit(s), ${hits.length - genuineCount} rejected`)

  if (!firstGenuineHit) throw new Error(`no genuine hits found in ${repo.id}, nothing to prove or patch`)

  console.log('Verifying patch in sandbox...')
  const patchForProof = hits.find((h) => h.hit === firstGenuineHit)!.patch!
  const proof = await verifyPatch(firstGenuineHit, patchForProof)
  console.log(`  proof passed: ${proof.passed}`)

  const prStart = Date.now()
  console.log('Opening pull request...')
  const { url } = await openPullRequest(repo, hits, proof)
  const prElapsed = ((Date.now() - prStart) / 1000).toFixed(1)

  console.log(`\nPR opened: ${url}`)
  console.log(`openPullRequest took ${prElapsed}s`)
  console.log(`total wall clock: ${((Date.now() - start) / 1000).toFixed(1)}s`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
