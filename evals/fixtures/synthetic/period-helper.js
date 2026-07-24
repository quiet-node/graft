// Adversarial: genuine Stripe access, but two call hops away from the SDK call and
// through a generically-named parameter, to test that provenance tracing follows
// callers instead of stopping at the first plain-looking line.
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)

async function loadSub(id) {
  return stripe.subscriptions.retrieve(id)
}

function formatPeriod(s) {
  return s.current_period_end
}

async function renewalTimestamp(id) {
  const s = await loadSub(id)
  return formatPeriod(s)
}

module.exports = { renewalTimestamp }
