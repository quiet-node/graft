import type { TargetRepo } from '../lib/types'
import { TARGET_REPOS } from '../lib/repos'

// The synthetic fixtures are not a cloned target repo, so scanRepo needs a TargetRepo
// shape pointing at evals/fixtures/synthetic. Only localPath is read by scanRepo/classify;
// the rest of the fields exist only to satisfy the type.
export const SYNTHETIC_REPO: TargetRepo = {
  id: 'synthetic',
  name: 'graft/evals-synthetic-fixtures',
  forkUrl: '',
  localPath: 'evals/fixtures/synthetic',
  file: 'destructure.js',
  line: 8,
  snippet: 'const { current_period_end, status } = subscription',
  expectedVerdict: 'genuine',
}

export const EVAL_REPOS: TargetRepo[] = [...TARGET_REPOS, SYNTHETIC_REPO]

export type EvalCase = {
  id: string
  repoId: string
  file: string
  line: number
  expectedVerdict: 'genuine' | 'false-positive'
  // exact expected rewritten line, only set for genuine cases
  expectedPatchAfter?: string
  synthetic: boolean
  note: string
}

export const CASES: EvalCase[] = [
  // -- real corpus: genuine --
  {
    id: 'decisionjam-58',
    repoId: 'decisionjam',
    file: 'server/Payments.js',
    line: 58,
    expectedVerdict: 'genuine',
    expectedPatchAfter: '                subscriptionEndDate: subscription.items.data[0].current_period_end',
    synthetic: false,
    note: 'stripe.subscriptions.create() callback',
  },
  {
    id: 'decisionjam-69',
    repoId: 'decisionjam',
    file: 'server/Payments.js',
    line: 69,
    expectedVerdict: 'genuine',
    expectedPatchAfter: '                subscriptionEndDate: subscription.items.data[0].current_period_end',
    synthetic: false,
    note: 'stripe.subscriptions.create() callback',
  },
  {
    id: 'stripe-subscriptions-214',
    repoId: 'stripe-subscriptions',
    file: 'app.js',
    line: 214,
    expectedVerdict: 'genuine',
    expectedPatchAfter: '      user.endDate = new Date(data.items.data[0].current_period_end * 1000)',
    synthetic: false,
    note: 'Stripe webhook event.data.object',
  },
  {
    id: 'stripe-subscriptions-238',
    repoId: 'stripe-subscriptions',
    file: 'app.js',
    line: 238,
    expectedVerdict: 'genuine',
    expectedPatchAfter: '        user.endDate = new Date(data.items.data[0].current_period_end * 1000)',
    synthetic: false,
    note: 'Stripe webhook event.data.object',
  },
  {
    id: 'stripe-subscriptions-241',
    repoId: 'stripe-subscriptions',
    file: 'app.js',
    line: 241,
    expectedVerdict: 'genuine',
    expectedPatchAfter: '        user.endDate = new Date(data.items.data[0].current_period_end * 1000)',
    synthetic: false,
    note: 'Stripe webhook event.data.object',
  },
  {
    id: 'stripe-subscriptions-251',
    repoId: 'stripe-subscriptions',
    file: 'app.js',
    line: 251,
    expectedVerdict: 'genuine',
    expectedPatchAfter: "      console.log('actual', user.hasTrial, data.items.data[0].current_period_end, user.plan)",
    synthetic: false,
    note: 'Stripe webhook event.data.object',
  },
  {
    id: 'chatbotkit-51',
    repoId: 'chatbotkit',
    file: 'lib/billing.js',
    line: 51,
    expectedVerdict: 'genuine',
    expectedPatchAfter: '    return (b.items.data[0].current_period_end || 0) - (a.items.data[0].current_period_end || 0)',
    synthetic: false,
    note: 'stripe.subscriptions.list(), two targets on one line',
  },
  {
    id: 'chatbotkit-184',
    repoId: 'chatbotkit',
    file: 'lib/billing.js',
    line: 184,
    expectedVerdict: 'genuine',
    expectedPatchAfter: '    currentPeriodEndsAt: toDate(subscription.items.data[0].current_period_end),',
    synthetic: false,
    note: 'stripe.subscriptions.list()',
  },
  {
    id: 'domain-estimator-subscription-handler-22',
    repoId: 'domain-estimator',
    file: 'api/stripe/handlers/subscription.js',
    line: 22,
    expectedVerdict: 'genuine',
    expectedPatchAfter: '        current_period_end: subscription.items.data[0].current_period_end,',
    synthetic: false,
    note: 'webhook event.data.object; object key and value share the field name, only the value changes',
  },

  // -- real corpus: false positive --
  {
    id: 'netflix-clone-app-48',
    repoId: 'netflix-clone',
    file: 'src/App.js',
    line: 48,
    expectedVerdict: 'false-positive',
    synthetic: false,
    note: 'Firestore document snapshot',
  },
  {
    id: 'netflix-clone-planscreen-66',
    repoId: 'netflix-clone',
    file: 'src/components/PlanScreen.js',
    line: 66,
    expectedVerdict: 'false-positive',
    synthetic: false,
    note: 'Redux selector',
  },
  {
    id: 'domain-estimator-migration-13',
    repoId: 'domain-estimator',
    file: 'api/db/migrations/002_stripe_tables.js',
    line: 13,
    expectedVerdict: 'false-positive',
    synthetic: false,
    note: 'SQL migration column definition',
  },
  {
    id: 'domain-estimator-db-19',
    repoId: 'domain-estimator',
    file: 'api/db.js',
    line: 19,
    expectedVerdict: 'false-positive',
    synthetic: false,
    note: 'raw SQL column definition',
  },
  {
    id: 'domain-estimator-db-36',
    repoId: 'domain-estimator',
    file: 'api/db.js',
    line: 36,
    expectedVerdict: 'false-positive',
    synthetic: false,
    note: 'raw SQL query string',
  },
  {
    id: 'domain-estimator-db-47',
    repoId: 'domain-estimator',
    file: 'api/db.js',
    line: 47,
    expectedVerdict: 'false-positive',
    synthetic: false,
    note: 'raw SQL query string',
  },
  {
    id: 'domain-estimator-routes-stripe-25',
    repoId: 'domain-estimator',
    file: 'api/routes/stripe.js',
    line: 25,
    expectedVerdict: 'false-positive',
    synthetic: false,
    note: 'Knex database row',
  },
  {
    id: 'domain-estimator-db-61',
    repoId: 'domain-estimator',
    file: 'api/db.js',
    line: 61,
    expectedVerdict: 'false-positive',
    synthetic: false,
    note: 'untraceable bare function parameter, correctly rejected under default-reject',
  },

  // -- synthetic: same distinction, new shapes --
  {
    id: 'synthetic-cache-mirror',
    repoId: 'synthetic',
    file: 'cache-mirror.js',
    line: 7,
    expectedVerdict: 'false-positive',
    synthetic: true,
    note: 'ADVERSARIAL: variable literally named "StripeSubscription" but is a Mongoose mirror document, not the Stripe SDK',
  },
  {
    id: 'synthetic-period-helper',
    repoId: 'synthetic',
    file: 'period-helper.js',
    line: 11,
    expectedVerdict: 'genuine',
    expectedPatchAfter: '  return s.items.data[0].current_period_end',
    synthetic: true,
    note: 'ADVERSARIAL: genuine Stripe access two call hops from stripe.subscriptions.retrieve(), through a generic parameter name',
  },
  {
    id: 'synthetic-already-migrated',
    repoId: 'synthetic',
    file: 'already-migrated.js',
    line: 7,
    expectedVerdict: 'false-positive',
    synthetic: true,
    note: 'already reads the new accessor (.items.data[0].current_period_end); must not be re-flagged as genuine',
  },
  {
    id: 'synthetic-destructure',
    repoId: 'synthetic',
    file: 'destructure.js',
    line: 8,
    expectedVerdict: 'genuine',
    // no expectedPatchAfter: baseExpressions finds no dot-chain target for a destructured
    // binding, so the real patcher has nothing to rewrite. Left unset on purpose to see
    // whether the pipeline can even attempt a fix here.
    synthetic: true,
    note: 'genuine Stripe access via destructuring, a shape with no member-chain for baseExpressions to find',
  },
]
