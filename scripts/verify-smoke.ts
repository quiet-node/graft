import 'dotenv/config'
import { TARGET_REPOS } from '../lib/repos'
import { verifyPatch } from '../lib/verify'
import type { ScanHit } from '../lib/scan'

async function main() {
  const repo = TARGET_REPOS[0]
  const hit: ScanHit = {
    file: repo.file,
    line: repo.line,
    text: repo.snippet,
    genuine: true,
    reason: 'hardcoded smoke example',
  }
  const patch = {
    before: repo.snippet,
    after: repo.snippet.replace('current_period_end', 'items.data[0].current_period_end'),
  }

  const proof = await verifyPatch(hit, patch)
  console.log(JSON.stringify(proof, null, 2))
}

main().catch((err) => {
  console.error('VERIFY SMOKE FAILED:', err)
  process.exit(1)
})
