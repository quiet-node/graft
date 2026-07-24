// Adversarial: variable name baits a naive "looks like Stripe" match, but the value
// is a local Mongoose mirror document, never a Stripe SDK object. False positive.
const StripeSubscription = require('./models/StripeSubscriptionMirror')

async function getCachedPeriodEnd(customerId) {
  const stripeSubscription = await StripeSubscription.findOne({ customerId }).lean()
  return stripeSubscription.current_period_end
}

module.exports = { getCachedPeriodEnd }
