# Live pitch: 3 minutes plus 2 minutes Q&A

Daytona HackSprint SF, 4:00 PM finalist round. Solo, spoken live, no narration track. Judging is Impact Potential 25, Technical Execution 25, Creativity 25, Presentation 25, plus a Sponsor Tool Usage bonus.

Spoken word count: **432 words**, counting only the quoted lines and excluding every stage direction. At a nervous 160 words per minute that is 2 minutes 42 seconds of speech, leaving about 18 seconds inside the marked pauses. At 175 you land at 2:30 and the pauses absorb the rest. If you read slower than 150 you will run over, so rehearse it once against a timer.

Shape: 26 seconds problem, 20 seconds what it is, 92 seconds demo, 24 seconds proof and measurement, 18 seconds close. That is the brief's budget with two seconds moved from the close into the demo, because the rejection beat is the whole differentiator and it needs the room.

---

## 1. The 3-minute script

Read the **spoken** lines only. Everything in brackets is a stage direction, not words.

---

### 0:00 to 0:26: the thing that happened

**Screen:** Stripe's Basil changelog page for the `current_period_start` / `current_period_end` deprecation, beside an editor showing a line that reads `subscription.current_period_end`.

> Last March, Stripe moved one field.
>
> Current period end. It used to live on the subscription. Now it lives on the subscription item.
>
> **[pause, two beats]**
>
> Nothing crashed. No error. No stack trace. The field just returns undefined. So renewal dates go blank, and billing quietly goes wrong for months.
>
> **[pause]**
>
> Almost nobody reads changelogs. That is the whole bug.

---

### 0:26 to 0:46: what it is

**Screen:** switch to the Graft dashboard. Header shows the detected change, old accessor struck through, new accessor beside it.

> This is Graft.
>
> Graft does not read changelogs. It reads the provider's own OpenAPI spec.
>
> Stripe committed this removal to their spec on the twenty fifth of March, twenty twenty five. The changelog announcing it came out on the thirty first.
>
> **[pause]**
>
> Graft had the change six days before the announcement.

---

### 0:46 to 1:04: the scan

**Screen:** scroll down one notch so the counters fill the frame: Scanned 17, Patched 9, Rejected 8.

> Then it scans customer repositories. Five real open source repos, cloned off GitHub.
>
> Grep finds seventeen lines carrying that field name.
>
> **[pause]**
>
> Graft patches nine.
>
> **[pause, and let the numbers sit]**
>
> Here is the part I actually care about.

---

### 1:04 to 1:44: the rejection (the strongest beat, give it air)

**Screen:** scroll the rejected rows slowly. Each row's classifier reason must be legible. Stop on one row at a time as you name it.

> Eight of those seventeen are not Stripe at all.
>
> **[pause]**
>
> This one is a SQL column definition. This one is a database migration. This one is a row that came back from Knex. This one is a Redux selector.
>
> **[pause]**
>
> Every one of them carries Stripe's field name, because a developer copied it years ago.
>
> A regex patches all seventeen and breaks eight working code paths.
>
> **[pause]**
>
> Graft traces every value back to where it came from. Through the local bindings, through the imports, through the call sites in other files. If the trace does not reach a Stripe SDK call or a webhook event, Graft does not touch the line.

---

### 1:44 to 1:58: the patch

**Screen:** expand the `api/stripe/handlers/subscription.js:22` row. Before line struck, after line beneath it.

> The nine that are real get rewritten. This is the hardest one in the corpus.
>
> The key and the value have the same name. Only the value is allowed to change.
>
> Graft changes the value, and leaves the key alone.

---

### 1:58 to 2:18: the sandbox differential

**Screen:** same row, sandbox proof block. `-> undefined` above, `-> 1787599666` below.

> Then it proves it.
>
> A Daytona sandbox runs both accessors against Stripe's live test API.
>
> The old one returns undefined. The new one returns a real timestamp.
>
> **[pause]**
>
> That is not a claim in a pull request. That is a result.

---

### 2:18 to 2:42: evidence and measurement

**Screen:** switch to the GitHub tab, already scrolled to the Patched lines table and the sandbox values. Then one tab across to the CodeRabbit review.

> Graft opens the pull request itself, carrying that evidence. Every patched line, where it came from, and the sandbox values. CodeRabbit reviewed one of these independently.
>
> **[pause]**
>
> And I scored the classifier in Braintrust, against twenty one cases I labelled by hand, including ones written to break it.
>
> Twenty out of twenty one. Ask me about the one it misses.

---

### 2:42 to 3:00: the close

**Screen:** back to the dashboard, whole run visible.

> That is the version you install.
>
> **[pause]**
>
> The version the provider installs runs before they ship. The breaking change and the fix land on the same day.
>
> **[pause]**
>
> Providers already know exactly who is affected. It is in their own request logs. They just cannot fix it.
>
> Graft is the part that fixes it.

---

**Delivery notes**

- Three places to genuinely stop: after "returns undefined" (0:20), after "Graft patches nine" (0:57), after "not Stripe at all" (1:07). Those are the three ideas that have to land.
- Do not say "seventeen, nine, eight" as a list. Say seventeen, then nine, then let the eight arrive as the reveal.
- Only two measured figures are spoken: seventeen/nine/eight, and twenty of twenty one. Everything else stays on screen.
- If you are behind at 2:20, cut the CodeRabbit clause and the Braintrust sentence and go straight to the close. Never cut the close.

---

## 2. Screen state and setup checklist

### Run it live, or pre-run?

**Pre-run. Have a completed run on screen before you start.** Three reasons, in order of weight:

1. A `run-pipeline.ts` wall clock of 18.8s and 27.1s is recorded in the README. That is 10 to 15 percent of the entire pitch, and up to a third of the demo budget, spent watching spinners.
2. The run needs live Fireworks, live Daytona, and live Stripe over conference wifi. Three network dependencies, one shot, no retry.
3. The dashboard reports failure honestly and in large type: "Pipeline stream failed", "Not verified. The sandbox run failed". Good engineering, terrible stage risk.

**Optional garnish if you are ahead of pace:** open a second dashboard tab and click Run pipeline right before you walk up. Talk over the completed run in tab one. If the live one lands during the demo, flip to it for three seconds: "that one ran while I was talking." If it does not land, never mention it.

### Tabs, in the order you will visit them

1. **Stripe changelog**: `docs.stripe.com/changelog/basil/2025-03-31/deprecate-subscription-current-period-start-and-end`. Scrolled to the deprecation text.
2. **Editor or a second window** showing a raw `subscription.current_period_end` line. `workspace/decisionjam/server/Payments.js:58` is the cleanest.
3. **Graft dashboard**: `localhost:3000`, run already complete, scrolled to the top so the header and the accessor diff are visible. This is your home tab.
4. **GitHub PR with the generated evidence**: `github.com/quiet-node/template-nextjs-slack-agent-platform-js/pull/1`. Pre-scrolled to the "Patched lines" table and the "Sandbox proof" block. This body is machine-generated by `lib/pr.ts`.
5. **GitHub PR with the CodeRabbit review**: `github.com/quiet-node/decisionjam/pull/1`. Pre-scrolled to CodeRabbit's review comment.
6. **Braintrust experiment**: the `graft-stripe-classifier` experiment page. Only opened if a judge asks in Q&A. Do not visit it during the pitch.

**Important:** tabs 4 and 5 are two different pull requests. The evidence tables and the CodeRabbit review are not on the same PR. Say "Graft opens the pull request carrying that evidence" over tab 4, then "CodeRabbit reviewed one of these" as you move to tab 5. Do not claim one PR has both.

### Before you stand up

**Do this one first. As of 14:21 today the working tree of `lib/scan.ts` contains a debug line that will break the demo numbers.**

Line 338 currently reads `{ timeout: candidate.line % 2 === 0 ? 1 : CLASSIFIER_TIMEOUT_MS, ... }`. That forces the classifier call to time out on every even-numbered candidate line. With it in place the run does not produce 17 / 9 / 8; roughly half the candidates come back as "Classifier failed". This is in-flight work from another editing session, alongside a genuine new classifier-failed state in `lib/events.ts` and `app/dashboard-client.tsx`. It is not a bug to debug at 15:50: get whoever is editing `lib/scan.ts` to drop that one conditional, or stash it.

- Pre-flight, must come back empty: `grep -n "% 2" lib/scan.ts`. Any hit means the run will not produce the demo numbers.
- Cheaper visual signal, no terminal needed: if a **Classifier failed** counter appears in the header row beside Scanned, Patched and Rejected, the run is not demo clean. That counter only renders when the count is above zero, so its absence is the green light.
- All five clones in `workspace/` on their default branch. Currently: decisionjam `master`, stripe-subscriptions `main`, chatbotkit `main`, netflix-clone `master`, domain-estimator `main`. If a clone is left on a `graft/...` branch, a rescan sees already-migrated source and reports zero genuine hits.
- `npm run dev` already running and warm. Load the page once so Next.js has compiled it.
- Browser zoom at 125 to 150 percent. Rejected rows are deliberately low contrast (grey, struck through, no colour); the back row cannot read them at 100 percent.
- Terminal off screen. Nothing in this pitch needs a terminal, and a visible one invites a judge to ask you to run something.
- Notifications off, Slack quit, screen sleep disabled.
- Dashboard scrolled to the top and the browser window already the presenting window. Do not do window management on stage.

---

## 3. Q&A preparation

Ordered by likelihood.

**1. How do you get access to your customers' code?**
Today, honestly: these are five open source repos I forked into my own account and cloned locally, and Graft opens the PRs with my own GitHub token. The product version is an opt-in GitHub App the customer installs, exactly the way Dependabot and CodeRabbit get access. Nothing about the pipeline changes; only where the clone comes from.

**2. How does the provider know which customers are affected?**
They already do, and that is the insight. Stripe can see every request that reads a deprecated field, by API key, in their own logs. That is the blast radius, and no third party can compute it. Graft is the piece that turns "we know who breaks" into "here is their patch." I want to be clear that nothing in this repo touches provider telemetry yet; today the blast radius comes from scanning the repos directly.

**3. Isn't this just a codemod? Or just Dependabot?**
Dependabot bumps your version and hands you a broken build; it never touches your code. A codemod is a syntactic rewrite that fires on shape, so it would patch all seventeen of my lines and break eight working code paths. Graft's unit of decision is provenance, not syntax: where did this value come from. That is the thing neither of them does.

**4. What happens when it gets a patch wrong?**
Two guards. The classifier defaults to reject when the trace runs out, because a missed fix is a bug left alone and a wrong fix is working code turned into broken code. And the output is a pull request, not a commit to main, with the provenance for every line it touched and the sandbox values in the body. A human reviews it, and CodeRabbit reviews it too.

**5. How do you know the classifier is right?**
I labelled every candidate line by hand and scored the classifier against those labels in Braintrust: twenty one cases, twenty correct. Four of them are synthetic fixtures I wrote to attack my own tracer, two of them deliberately adversarial, including a variable literally named `StripeSubscription` that is actually a Mongoose document. The scorer weights errors asymmetrically: a wrong "genuine" scores zero because it corrupts working code, a missed genuine gets partial credit because it only leaves a bug.

**6. Does this only work for Stripe?**
The pipeline is provider-agnostic; the detector diffs any OpenAPI spec. What is Stripe-specific right now is the scope: one field removal, one schema. Generalising to arbitrary spec diffs is real work I have not done, and I would rather say that than pretend a five-hour build covers every provider.

**7. What is the business model? Who pays?**
The provider pays, because the provider carries the cost. Every deprecation buys them a support queue, a migration guide nobody reads, and a compatibility shim they maintain for years. Graft turns that into a set of pull requests that land the same week. Customer-side installs are the distribution; provider-side is the revenue.

**8. Why would a provider adopt this instead of just writing a better changelog?**
Because changelog quality is not the failure. Stripe's changelog for this change is excellent, and my five repos still broke. Documentation asks every customer to independently notice, understand, and correctly apply the same fix. Graft does it once and ships the diff. A better changelog scales linearly with customer effort; this does not.

**9. Why is a language model doing this instead of a static analyser or the TypeScript compiler?**
Fair, and for a typed repo with strict settings the compiler catches some of this. Every one of my seventeen candidate lines lives in a plain `.js` file, where the compiler sees nothing at all. The model is doing a bounded job here: I hand it the traced provenance, the imports, the bindings and the cross-file call sites, and ask one yes-or-no question at temperature zero. It is not being asked to be creative.

**10. How long does a run take, and what does it cost?**
Twenty to thirty seconds for all five repos in parallel, and about a third of a cent in Fireworks tokens for a full scan. The sandbox proof is another three to four seconds on top. Cost is not what stops this shipping.

**11. Why did you build the false-positive detection instead of just patching everything?**
Because patching everything is a tool nobody installs. If a bot rewrites your SQL migration once, you uninstall it and you tell your team not to trust it. Precision is not a nice-to-have here; it is the entire adoption condition.

**12. What is next if you kept going?**
Three things in order: poll the spec on a schedule rather than diffing two pinned tags by hand, run each repo's own test suite in the sandbox instead of a shared accessor proof, and generalise the detector past a single field removal to renames, type changes and enum removals.

---

## 4. Known weaknesses, answered straight

A judge who catches an evasion discounts everything else. Each of these is true, and each has a real answer.

**The classifier fails one case, and it fails in the dangerous direction.**
The `already-migrated` fixture reads `subscription.items.data[0].current_period_end`, the new accessor, and the classifier still calls it genuine. That is a false genuine, the error class I explicitly designed against. Two honest mitigations: the patcher then emits the line unchanged, and `lib/pr.ts` filters no-op patches out of the commit and lists them as skipped, so nothing gets corrupted. It is a wasted verdict, not a broken file. It is also the first thing I would fix.

**A destructured binding classifies correctly and then does not get patched.**
`const { current_period_end, status } = subscription` traces correctly to `stripe.subscriptions.retrieve()` and is called genuine, but `baseExpressions` finds no member chain before the field name, so the patcher has no rewrite target and returns the line unchanged. The classification is right; the fix is missing. That shape needs a real AST rewrite, not a single-line edit.

**The sandbox proves the accessor, not each individual patch.**
`verifyPatch` ignores both of its arguments and never runs the target repo's own tests. It proves one thing well: against a live Stripe subscription under `2025-03-31.basil`, the old accessor is gone and the new one returns a number. The dashboard says so on screen, in the proof block. Per-repo test execution in the sandbox is the honest next step.

**Nothing polls Stripe.**
The spec diff is precomputed by a script I ran by hand against two pinned tags, `v1494` and `v1618`. The detection logic is real, the scheduling is not built.

**The verdicts are model output, not static analysis.**
`gpt-oss-20b` at temperature zero, and two runs produced identical verdicts, and this eval run reproduced the previous run's scores exactly. That is reproducible, and it is not the same as sound. I would not claim soundness for it.

**The ground truth is mine.**
I read all seventeen sites and labelled them myself. The Braintrust score measures the classifier against my judgement, not against an independent oracle. The four synthetic fixtures are adversarial precisely because I wrote them to attack my own tracer, which is the closest thing to independence I could build in an afternoon.

**PRs exist on two of the five forks, and CodeRabbit reviewed one of them, triggered by an explicit comment.**
The PR step also runs from a script rather than from the dashboard button. It is wired end to end, but it is not one click.

**One rejection is a default reject, not a proof of innocence.**
`api/db.js:61` is a bare function parameter with no traceable origin. Graft rejects it because the evidence ran out, which is the correct policy and happens to match ground truth here. I am not claiming it understood that line.

---

## 5. The one-sentence version

If you get thirty seconds and nothing else:

> When an API provider ships a breaking change, Graft finds the lines in customer code that actually break, patches them, proves the fix against the live API in a sandbox, and opens the pull request, so the fix ships with the change instead of six months later.

Fallback if even that is too long: **"Graft ships the fix at the same time the provider ships the breaking change."**
