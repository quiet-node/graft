// Already patched: reads the field through .items.data[0], the new accessor. False
// positive, must not be re-patched.
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)

async function getPeriodEnd(id) {
  const subscription = await stripe.subscriptions.retrieve(id)
  return subscription.items.data[0].current_period_end
}

module.exports = { getPeriodEnd }
