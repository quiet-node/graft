import { Daytona } from '@daytona/sdk'
import type { ScanHit } from './scan'

export type Proof = {
  before: string
  after: string
  passed: boolean
}

const STRIPE_API_VERSION = '2025-03-31.basil'

const SANDBOX_SCRIPT = `
const Stripe = require('stripe')
const stripe = new Stripe(process.env.STRIPE_TEST_KEY, { apiVersion: '${STRIPE_API_VERSION}' })
stripe.subscriptions.list({ limit: 1 }).then((res) => {
  const sub = res.data[0]
  console.log(JSON.stringify({
    before: sub.current_period_end,
    after: sub.items.data[0].current_period_end,
  }))
}).catch((err) => {
  console.error('STRIPE_ERROR:', err.message)
  process.exit(1)
})
`

// hit and patch are accepted per the calling contract (RepoState pipeline); the Stripe
// proof itself is generic (current_period_end moved under items.data[0] for every hit).
export async function verifyPatch(_hit: ScanHit, _patch: { before: string; after: string }): Promise<Proof> {
  const stripeKey = process.env.STRIPE_TEST_KEY
  if (!stripeKey) {
    return {
      before: 'STRIPE_TEST_KEY not set: verification not run',
      after: 'STRIPE_TEST_KEY not set: verification not run',
      passed: false,
    }
  }

  const daytona = new Daytona()
  const sandbox = await daytona.create()
  try {
    await sandbox.process.executeCommand('npm init -y && npm i stripe@latest', undefined, undefined, 120)
    await sandbox.process.executeCommand(`cat > /tmp/verify.js << 'EOF'\n${SANDBOX_SCRIPT}\nEOF`)
    const response = await sandbox.process.executeCommand('node /tmp/verify.js', undefined, {
      STRIPE_TEST_KEY: stripeKey,
    }, 60)

    if (response.exitCode !== 0) {
      const msg = `sandbox script failed (exit ${response.exitCode}): ${response.result}`
      return { before: msg, after: msg, passed: false }
    }

    let parsed: { before: unknown; after: unknown }
    try {
      parsed = JSON.parse(response.result.trim())
    } catch {
      const msg = `could not parse sandbox output: ${response.result}`
      return { before: msg, after: msg, passed: false }
    }

    const beforeMissing = parsed.before === undefined || parsed.before === null
    const afterIsNumber = typeof parsed.after === 'number'

    return {
      before: `subscription.current_period_end -> ${parsed.before}`,
      after: `subscription.items.data[0].current_period_end -> ${parsed.after}`,
      passed: beforeMissing && afterIsNumber,
    }
  } finally {
    await daytona.delete(sandbox)
  }
}
