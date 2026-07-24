// Build-time tool. Run once by hand: npx tsx scripts/build-spec-diff.ts
// Diffs components.schemas.subscription.properties and
// components.schemas.subscription_item.properties between two stripe/openapi
// tags that bracket the "Basil" release (2025-03-31.basil), and writes the
// result to data/spec-diff.json.
//
// Tag selection: openapi/spec3.json (the legacy, non-beta spec) only changes
// a handful of times per quarter, not per tag. Walking
// `gh api repos/stripe/openapi/commits?path=openapi/spec3.json` shows the
// commit that actually moved current_period_start/end off Subscription onto
// SubscriptionItem landed 2025-03-25T13:29:18Z (tag v1618), six days ahead of
// the officially announced 2025-03-31 changelog date. The prior commit that
// touched spec3.json was 2025-02-14T21:58:23Z (tag v1494), which still has
// the old shape. Tags strictly bracketing the calendar date 2025-03-31
// (e.g. v1641/v1642) are both already past the change and diff empty, since
// spec3.json had not been touched again since v1618.

import fs from 'node:fs'
import path from 'node:path'

const FROM_TAG = 'v1494'
const TO_TAG = 'v1618'
const API_VERSION = '2025-03-31.basil'

const CACHE_DIR = path.join(process.cwd(), '.cache')
const OUT_PATH = path.join(process.cwd(), 'data', 'spec-diff.json')

const FIELDS = ['current_period_start', 'current_period_end']

type JsonSchema = { properties?: Record<string, unknown> }
type Spec3 = { components: { schemas: Record<string, JsonSchema> } }

async function fetchSpec(tag: string): Promise<Spec3> {
  const cachePath = path.join(CACHE_DIR, `spec3-${tag}.json`)
  if (fs.existsSync(cachePath)) {
    return JSON.parse(fs.readFileSync(cachePath, 'utf8'))
  }
  const url = `https://raw.githubusercontent.com/stripe/openapi/${tag}/openapi/spec3.json`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`fetch ${url} failed: ${res.status}`)
  const text = await res.text()
  fs.mkdirSync(CACHE_DIR, { recursive: true })
  fs.writeFileSync(cachePath, text)
  return JSON.parse(text)
}

type Change = {
  kind: 'field-removed'
  severity: 'breaking'
  schema: string
  field: string
  movedTo: string
  oldAccessor: string
  newAccessor: string
  changelogUrl: string
}

function diffSchemas(oldSpec: Spec3, newSpec: Spec3): Change[] {
  const oldSub = Object.keys(oldSpec.components.schemas.subscription.properties ?? {})
  const newSub = Object.keys(newSpec.components.schemas.subscription.properties ?? {})
  const oldItem = Object.keys(oldSpec.components.schemas.subscription_item.properties ?? {})
  const newItem = Object.keys(newSpec.components.schemas.subscription_item.properties ?? {})

  const removedFromSub = oldSub.filter((k) => !newSub.includes(k))
  const addedToItem = newItem.filter((k) => !oldItem.includes(k))

  const changes: Change[] = []
  for (const field of FIELDS) {
    if (removedFromSub.includes(field) && addedToItem.includes(field)) {
      changes.push({
        kind: 'field-removed',
        severity: 'breaking',
        schema: 'subscription',
        field,
        movedTo: `subscription_item.${field}`,
        oldAccessor: `subscription.${field}`,
        newAccessor: `subscription.items.data[0].${field}`,
        changelogUrl:
          'https://docs.stripe.com/changelog/basil/2025-03-31/deprecate-subscription-current-period-start-and-end',
      })
    }
  }
  return changes
}

async function main() {
  console.log(`fetching spec3.json @ ${FROM_TAG} and ${TO_TAG}...`)
  const [oldSpec, newSpec] = await Promise.all([fetchSpec(FROM_TAG), fetchSpec(TO_TAG)])

  const changes = diffSchemas(oldSpec, newSpec)
  console.log(`found ${changes.length} matching change(s):`, changes.map((c) => c.field))

  const out = {
    provider: 'stripe',
    fromVersion: FROM_TAG,
    toVersion: TO_TAG,
    apiVersion: API_VERSION,
    detectedAt: new Date().toISOString(),
    changes,
  }

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true })
  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2) + '\n')
  console.log(`wrote ${OUT_PATH}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
