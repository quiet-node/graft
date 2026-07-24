// Genuine Stripe access via destructuring, a shape baseExpressions cannot see since
// there is no dot-chain immediately before the field name. Tests whether the classifier
// still traces "subscription" back to stripe.subscriptions.retrieve() from context alone.
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)

async function summarize(id) {
  const subscription = await stripe.subscriptions.retrieve(id)
  const { current_period_end, status } = subscription
  return { current_period_end, status }
}

module.exports = { summarize }
