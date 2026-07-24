import { Daytona } from '@daytona/sdk'
import type { ScanHit } from './scan'

export type Timing = {
  createMs: number
  installMs: number
  execMs: number
  totalMs: number
}

export type Proof = {
  before: string
  after: string
  passed: boolean
  timing?: Timing
}

const STRIPE_API_VERSION = '2025-03-31.basil'
const STRIPE_VERSION = '22.3.2'

// node resolves modules from the script's own directory upward, so the script and the
// node_modules tree installed for it must live in the same directory.
// Sandboxes deny outbound traffic by default, so the Stripe API has to be opened explicitly
// at create time. The runtime updateNetworkSettings path is refused on this account tier;
// the create-time allow list is honoured. The list replaces the default allowances rather
// than extending them, so the npm registry has to be named here too or the install fails
// with EAI_AGAIN.
const DOMAIN_ALLOW_LIST = 'api.stripe.com,registry.npmjs.org,*.npmjs.org'

// A healthy install lands in about two seconds. The cap is set well above that but well
// under the length of a live demo, so a stalled registry fails fast instead of hanging.
const INSTALL_TIMEOUT_SEC = 60

const WORK_DIR = '/tmp/graft'
const SCRIPT_PATH = `${WORK_DIR}/verify.js`
const SENTINEL = 'GRAFT_PROOF:'

// The key is never written into this file; it arrives as a sandbox process env var.
const SANDBOX_SCRIPT = `
const Stripe = require('stripe')
const stripe = new Stripe(process.env.STRIPE_TEST_KEY, { apiVersion: '${STRIPE_API_VERSION}' })
stripe.subscriptions.list({ limit: 1 }).then((res) => {
  const sub = res.data[0]
  console.log('${SENTINEL}' + JSON.stringify({
    before: sub.current_period_end,
    after: sub.items.data[0].current_period_end,
  }))
}).catch((err) => {
  console.error('STRIPE_ERROR:', err.message)
  process.exit(1)
})
`

// Sandbox output carries npm and node chatter on the same stream, so the payload is
// tagged and pulled out by prefix rather than parsed whole.
function extractPayload(output: string): string | null {
  for (const line of output.split('\n')) {
    const at = line.indexOf(SENTINEL)
    if (at !== -1) return line.slice(at + SENTINEL.length).trim()
  }
  return null
}

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
  const t0 = Date.now()
  const sandbox = await daytona.create({ domainAllowList: DOMAIN_ALLOW_LIST })
  const createMs = Date.now() - t0

  try {
    const t1 = Date.now()
    const install = await sandbox.process.executeCommand(
      `mkdir -p ${WORK_DIR} && cd ${WORK_DIR} && npm init -y && npm i --no-audit --no-fund stripe@${STRIPE_VERSION}`,
      undefined,
      undefined,
      INSTALL_TIMEOUT_SEC
    )
    const installMs = Date.now() - t1
    if (install.exitCode !== 0) {
      const msg = `sandbox npm install failed (exit ${install.exitCode}): ${install.result.slice(-400)}`
      return { before: msg, after: msg, passed: false, timing: { createMs, installMs, execMs: 0, totalMs: Date.now() - t0 } }
    }

    await sandbox.process.executeCommand(`cat > ${SCRIPT_PATH} << 'EOF'\n${SANDBOX_SCRIPT}\nEOF`)

    const t2 = Date.now()
    const response = await sandbox.process.executeCommand(`node ${SCRIPT_PATH}`, WORK_DIR, {
      STRIPE_TEST_KEY: stripeKey,
    }, 60)
    const execMs = Date.now() - t2
    const timing: Timing = { createMs, installMs, execMs, totalMs: Date.now() - t0 }

    if (response.exitCode !== 0) {
      const msg = `sandbox script failed (exit ${response.exitCode}): ${response.result}`
      return { before: msg, after: msg, passed: false, timing }
    }

    const payload = extractPayload(response.result)
    if (payload === null) {
      const msg = `sandbox output carried no proof payload: ${response.result}`
      return { before: msg, after: msg, passed: false, timing }
    }

    let parsed: { before: unknown; after: unknown }
    try {
      parsed = JSON.parse(payload)
    } catch {
      const msg = `could not parse sandbox output: ${payload}`
      return { before: msg, after: msg, passed: false, timing }
    }

    const beforeMissing = parsed.before === undefined || parsed.before === null
    const afterIsNumber = typeof parsed.after === 'number'

    return {
      before: `subscription.current_period_end -> ${parsed.before}`,
      after: `subscription.items.data[0].current_period_end -> ${parsed.after}`,
      passed: beforeMissing && afterIsNumber,
      timing,
    }
  } finally {
    await daytona.delete(sandbox)
  }
}
