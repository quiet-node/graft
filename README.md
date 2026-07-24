# Graft

Graft watches an API provider's published OpenAPI spec, detects a breaking change, scans customer repositories for code that actually breaks, patches it, proves the patch works in a sandbox against the live API, and opens a pull request carrying that evidence.

The demo target is real: Stripe's Basil release (`2025-03-31.basil`) removed `current_period_start` and `current_period_end` from the Subscription object and moved them onto SubscriptionItem.

## Why this is not a regex

Grep for `current_period_end` across the five repositories in `lib/repos.ts` and you get 17 lines. Nine of them are genuine Stripe Subscription reads that break under Basil. Seven are SQL column definitions, a Knex migration, a Knex row, a Firestore snapshot, and a Redux selector, all carrying the same field name because somebody copied it out of Stripe years ago. The eighth passes the field through a bare function parameter with no traceable origin, and is rejected because the evidence runs out rather than because it was proven innocent.

A pattern matcher patches all 17 and breaks eight working code paths. Graft classifies each line by asking where the value came from, not what the line looks like. It traces the base expression back through local bindings, two hops deep, plus imports, enclosing scope, and cross-file call sites of the enclosing function, and only calls a line genuine when the trace reaches a Stripe SDK call or a Stripe webhook event object.

Concrete pair from the same corpus, both matching the same grep:

```js
// workspace/domain-estimator/api/routes/stripe.js:25   REJECTED
currentPeriodEnd: new Date(subscription.current_period_end * 1000),
// traced to: db('subscriptions') via Knex. A database row, not a Stripe object.

// workspace/domain-estimator/api/stripe/handlers/subscription.js:22   GENUINE
current_period_end: subscription.current_period_end,
// traced to: event.data.object from a Stripe webhook. Breaks under Basil.
```

The two lines look almost identical. The provenance is opposite. Note also that the second line is the hardest rewrite in the corpus: the object key and the value share the name, and only the value may change.

```js
current_period_end: subscription.items.data[0].current_period_end,
```

## Pipeline

1. **Detect.** `scripts/build-spec-diff.ts` fetches `openapi/spec3.json` from two real tags of `github.com/stripe/openapi`, `v1494` and `v1618`, and diffs `components.schemas.subscription.properties` against `components.schemas.subscription_item.properties`. The two fields present on Subscription at `v1494` are absent at `v1618` and present on SubscriptionItem instead. The result is written to `data/spec-diff.json`, including the old and new accessor forms. Nothing in that file is hand written.
2. **Clone.** `lib/workspace.ts` shallow-clones each target repo from `lib/repos.ts` into `workspace/<id>`.
3. **Scan.** `lib/scan.ts` walks each repo, collects every line containing the removed field, assembles a provenance excerpt per candidate (surrounding window, enclosing block headers, imports and requires, binding sites for each traced identifier two hops deep, and up to six call sites of the enclosing function from other files), and asks a Fireworks model for a strict JSON verdict of `{provenance, genuine, reason}`. When the trace does not clearly reach Stripe, the answer is `genuine: false`. Default reject is deliberate: a missed bug is cheap, a confident wrong patch is not.
4. **Patch.** `lib/patch.ts` rewrites one line at a time. The model is given only the base expressions the classifier traced to Stripe, and is told to leave every other occurrence of the field on that line alone. The original line's indentation is copied back verbatim and multi-line answers are rejected, so a patch can never shift line numbers.
5. **Prove.** `lib/verify.ts` creates a Daytona sandbox with an egress allow list of `api.stripe.com` and the npm registry, installs `stripe@22.3.2`, and runs both accessors against a real subscription from the live Stripe test API pinned to `2025-03-31.basil`. The run passes only when the old accessor returns `undefined` and the new one returns a number.
6. **Ship.** `lib/pr.ts` applies each patch to the recorded line, refusing any line whose text no longer matches what was scanned, bumps the `stripe` dependency range to `^18.0.0`, commits, pushes, and opens a PR through `gh`. The PR body carries a table of patched lines with their provenance, a second table of every line Graft declined to patch and why, and the sandbox before and after values.

## The Stripe change it demonstrates

`data/spec-diff.json` records the move for both `current_period_start` and `current_period_end`, from `subscription.<field>` to `subscription.items.data[0].<field>`.

The interesting part is the timing. Stripe's changelog for this deprecation is dated 2025-03-31. The commit that actually moved the fields in the published spec is `9fa5188b`, tagged `v1618`, dated 2025-03-25 at 13:29 UTC. The previous commit touching `openapi/spec3.json` is `5a411d0d`, tagged `v1494`, dated 2025-02-14, and it still has the old shape. There are zero commits to that path in between. The provider's own machine readable spec carried the breaking change six days before the human announcement.

That gap is the product. A tool watching the spec starts work before the changelog exists.

## Sponsor tools

| Tool | Role in Graft | Where |
| --- | --- | --- |
| Fireworks | Provenance classification and patch generation, `gpt-oss-20b` at temperature 0 in JSON mode, capped at 12 concurrent calls | `lib/fireworks.ts`, `lib/scan.ts`, `lib/patch.ts` |
| Daytona | Sandboxed differential proof against the live Stripe test API, with a create-time domain allow list | `lib/verify.ts` |
| Braintrust | Scores the classifier against a 21 case labelled dataset, 17 real corpus lines plus 4 adversarial synthetic fixtures | `evals/` |
| CodeRabbit | Independent review of the pull requests Graft opens | run on `quiet-node/decisionjam` PR #1 |
| CopilotKit | Dashboard shell and sidebar, with its runtime pointed at Fireworks | `app/dashboard-client.tsx`, `app/api/copilotkit/route.ts` |
| ElevenLabs | Demo video narration, from `docs/narration.md` | no code path |

The Braintrust scorers are asymmetric on purpose. A false genuine, meaning working code rewritten into code that crashes, scores 0. A missed genuine, meaning a real bug left unpatched, scores 0.4. Patch correctness is exact string match against the expected rewritten line.

## Running it

Requires Node, and the `gh` CLI authenticated for the pull request step.

```
npm install
cp .env.local.example .env.local   # then fill in the keys
```

Environment variable names, all read from `.env.local`:

- `FIREWORKS_API_KEY`
- `DAYTONA_API_KEY`
- `STRIPE_TEST_KEY`
- `GITHUB_TOKEN`
- `BRAINTRUST_API_KEY`
- `ELEVENLABS_API_KEY`

The Stripe test account needs at least one subscription with an item, otherwise the sandbox proof has nothing to read.

```
npx tsx scripts/build-spec-diff.ts   # rebuild data/spec-diff.json from the live spec tags
npx tsx scripts/run-pipeline.ts      # clone, scan, patch, print every verdict to stdout
npx tsx scripts/verify-smoke.ts      # one Daytona sandbox proof
npx tsx scripts/pr-smoke.ts          # full run against one repo, ending in a real PR
npm run eval                         # Braintrust scoring of the classifier
npm run dev                          # dashboard on localhost:3000
```

The dashboard's Run pipeline button streams newline delimited JSON from `app/api/run/route.ts`. It expects the repos to be cloned already, so run `scripts/run-pipeline.ts` once first.

## Measured numbers

All figures below come from runs on 2026-07-24 against the five repositories in `lib/repos.ts`.

- 17 candidate lines matched across 5 repositories. 9 classified genuine, 8 rejected. Identical verdicts on two consecutive runs, and identical to the hand labelled ground truth in `evals/dataset.ts`.
- Scan wall clock, classification only, all 5 repos in parallel: 18.8s and 27.1s on two runs.
- Fireworks usage for one full scan: 17 calls, about 18,400 prompt tokens and 6,300 completion tokens, costing $0.0032 at the published serverless rate. Patch generation adds one call per genuine hit on top of that, and that added cost was not measured separately.
- All 9 genuine lines were run through the patch generator and all 9 were rewritten to exactly the line recorded in `evals/dataset.ts`, including the shared name case above and the line in `chatbotkit/lib/billing.js` that carries two separate rewrite targets.
- Sandbox proof: 4.06s and 3.16s total on two runs, broken down as sandbox create 0.22s to 0.24s, npm install 2.4s to 2.9s, script execution 0.35s to 0.59s.
- Sandbox result, both runs: `subscription.current_period_end` returned `undefined`, `subscription.items.data[0].current_period_end` returned `1787599666`.

## Limitations

Stated plainly, because a judge who finds these unlisted has reason to doubt everything above.

- **One change, one provider.** Graft handles a single field removal from a single Stripe schema. The detector diffs two named schemas for two named fields. Generalising to arbitrary spec diffs is not built.
- **The spec diff is precomputed, not polled.** `data/spec-diff.json` is generated by hand running `scripts/build-spec-diff.ts` against two hardcoded tags. Nothing in the running system watches Stripe for new spec commits.
- **The sandbox proof is generic, not per repository.** `verifyPatch` ignores its hit and patch arguments. It proves once, against the live Stripe API, that the old accessor is gone and the new one returns a value. It does not execute each customer repo's own code, so it demonstrates that the migration is correct rather than that any given repo now passes its own tests. The dashboard says this out loud on every proof block.
- **The pull request step is not wired into the dashboard.** `app/api/run/route.ts` runs detect, scan, patch, and prove. Opening a PR happens from `scripts/pr-smoke.ts`.
- **Coverage of the PR step is partial.** Pull requests exist on 2 of the 5 forks. CodeRabbit has reviewed one of them, and that review was triggered by an explicit comment rather than automatically.
- **One rejection is a default reject, not a proof of innocence.** `workspace/domain-estimator/api/db.js:61` passes the field through a bare function parameter with no traceable origin. Graft rejects it because the evidence runs out, not because it established the value is not from Stripe. That is the intended behaviour under the asymmetric cost of the two error types, but it is a miss if the value ever does come from Stripe.
- **Verdicts are model output.** Temperature is 0 and both measured runs agreed on all 17 lines, but nothing here is a static analyser and nothing guarantees a third run is identical.
