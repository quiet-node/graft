# Graft AI

Dependabot bumps your version and hands you a broken build. Graft AI bumps it and fixes your code so it still works.

Graft watches a provider's OpenAPI spec, scans repos for code the change breaks, patches it, proves it in a live-API sandbox, and opens a PR with the evidence. Target: Stripe `2025-03-31.basil` moved `current_period_start` and `current_period_end` off Subscription onto SubscriptionItem.

## Why not a regex

Grep five repos for `current_period_end`: 17 lines, 9 genuine. The rest: SQL columns, a Knex migration, a Knex row, a Firestore snapshot, a Redux selector, all copy-paste namesakes. Graft classifies by provenance: it traces the base expression through bindings, imports, and cross-file call sites, accepting only lines whose trace reaches a Stripe SDK call or webhook.

```js
// workspace/domain-estimator/api/routes/stripe.js:25  REJECTED: db('subscriptions') via Knex
currentPeriodEnd: new Date(subscription.current_period_end * 1000),

// workspace/domain-estimator/api/stripe/handlers/subscription.js:22  GENUINE: event.data.object, Stripe webhook
current_period_end: subscription.current_period_end,
```

Hardest case: key and value share a name, only the value changes.

```js
// before
current_period_end: subscription.current_period_end,
// after
current_period_end: subscription.items.data[0].current_period_end,
```

Stripe committed this removal to their spec on 2025-03-25. The changelog announcing it came six days later.

## Pipeline

1. Detect: diff `openapi/spec3.json` across Stripe tags `v1494`/`v1618`.
2. Clone: shallow-clone each repo from `lib/repos.ts`.
3. Scan: provenance excerpt per candidate, strict JSON verdict from Fireworks, default reject.
4. Patch: one line, indentation preserved, other occurrences untouched.
5. Prove: Daytona sandbox, egress allow list, old accessor `undefined`, new one numeric.
6. Ship: apply, bump `stripe` to `^18.0.0`, open PR with verdicts and proof.

## Sponsor tools

| Tool | Role | Where |
| --- | --- | --- |
| Fireworks | Classify and patch, `gpt-oss-20b` | `lib/scan.ts`, `lib/patch.ts` |
| Daytona | Sandboxed live-Stripe proof | `lib/verify.ts` |
| Braintrust | Classifier scoring, 21 cases | `evals/` |
| CodeRabbit | Independent PR review | `quiet-node/decisionjam` PR #1 |
| CopilotKit | Dashboard, Fireworks runtime | `app/dashboard-client.tsx` |
| ElevenLabs | Demo narration | `scripts/narrate.ts` |

## Measured numbers

- 17 candidates on 2026-07-24: 9 genuine, 8 rejected, identical on two runs and to `evals/dataset.ts`.
- Scan, all repos parallel: 18.8s and 27.1s.
- One scan (classification only): 17 Fireworks calls, ~18,400 prompt and 6,300 completion tokens, $0.0032.
- All 9 patched to exactly the expected line.
- Sandbox proof 4.06s and 3.16s: old accessor `undefined`, new `1787599666`.

## Running it

```
npm install
cp .env.local.example .env.local
npx tsx scripts/build-spec-diff.ts
npx tsx scripts/run-pipeline.ts
npx tsx scripts/verify-smoke.ts
npx tsx scripts/pr-smoke.ts
npm run eval
npm run dev
```

`.env.local`: `FIREWORKS_API_KEY`, `DAYTONA_API_KEY`, `STRIPE_TEST_KEY`, `GITHUB_TOKEN`, `BRAINTRUST_API_KEY`, `ELEVENLABS_API_KEY`.

## Limitations

- One field removal, one Stripe schema. Arbitrary spec diffs not built.
- Spec diff precomputed by hand-run script against two hardcoded tags. Nothing polls Stripe.
- Proof is generic: `verifyPatch` ignores its arguments, never runs a repo's own tests.
- PR step not wired into the dashboard; runs from `scripts/pr-smoke.ts`.
- PRs on 2 of 5 forks. CodeRabbit reviewed one, triggered by explicit comment, not automatically.
- `workspace/domain-estimator/api/db.js:61` is a default reject, not proof of innocence: bare parameter, evidence ran out.
- Verdicts are model output. Temperature 0, two runs agreed, but not a static analyser.

