# Demo video narration

Target length under two minutes. The spoken text below is 1,587 characters, 266 words, which lands between one minute forty and one minute fifty at a conversational pace. Read by an ElevenLabs voice, so the script avoids symbols, parentheses, and anything a narrator cannot say aloud.

## Timestamped beats

| Time | On screen | Narration |
| --- | --- | --- |
| 0:00 to 0:15 | Stripe changelog page for the Basil deprecation, then a code editor showing a line that reads `subscription.current_period_end` | Stripe shipped a breaking change. The subscription object no longer has a current period end. It moved onto the subscription item. Almost nobody reads changelogs. Nothing crashed. The field just returns undefined, so billing dates quietly go wrong. |
| 0:15 to 0:28 | The Graft dashboard header showing the detected change, old accessor struck through, new accessor beside it | Graft AI does not read changelogs. It reads the provider's own published spec. Stripe committed this removal to their OpenAPI spec on March twenty fifth. The changelog announcing it came six days later. Graft had the change first. |
| 0:28 to 0:56 | Run pipeline clicked. Counters fill in: seventeen matched, nine patched, eight rejected. Scroll the rejected rows so each provenance reason is legible | Then it scans customer repositories. Seventeen lines match across five repos. This next part is the product. Eight of them are not Stripe at all. A SQL column definition. A database migration. A Knex database row. A Redux selector. They carry Stripe's field name because someone copied it years ago. A naive tool patches all seventeen and breaks eight working code paths. Graft traces where every value came from, and rejects them. |
| 0:56 to 1:10 | A genuine row expanded, showing the red before line and the green after line for the shared name case | Nine are real. Graft rewrites each one. The hardest looks like this. The key and the value share a name, and only the value may change. Graft changes the value, not the key. |
| 1:10 to 1:24 | The sandbox proof block on that same row, before and after values visible | Then it proves it. A sandbox runs both accessors against Stripe's live test API. The old one returns undefined. The new one returns a timestamp. |
| 1:24 to 1:34 | The open pull request on GitHub, scrolled to the evidence tables, then to the CodeRabbit review | It opens a pull request carrying that evidence, with an independent CodeRabbit review already on it. |
| 1:34 to 1:50 | Back to the dashboard, full run visible, then the Graft title card | That is the version you install. The version Stripe installs runs this before they ship, so the change and the fix land together. Providers already know who is affected, from their own request logs. They just cannot fix it. Graft is the layer that can. |

## Continuous script for text to speech

Stripe shipped a breaking change. The subscription object no longer has a current period end. It moved onto the subscription item. Almost nobody reads changelogs. Nothing crashed. The field just returns undefined, so billing dates quietly go wrong.

Graft AI does not read changelogs. It reads the provider's own published spec. Stripe committed this removal to their OpenAPI spec on March twenty fifth. The changelog announcing it came six days later. Graft had the change first.

Then it scans customer repositories. Seventeen lines match across five repos. This next part is the product. Eight of them are not Stripe at all. A SQL column definition. A database migration. A Knex database row. A Redux selector. They carry Stripe's field name because someone copied it years ago. A naive tool patches all seventeen and breaks eight working code paths. Graft traces where every value came from, and rejects them.

Nine are real. Graft rewrites each one. The hardest looks like this. The key and the value share a name, and only the value may change. Graft changes the value, not the key.

Then it proves it. A sandbox runs both accessors against Stripe's live test API. The old one returns undefined. The new one returns a timestamp.

It opens a pull request carrying that evidence, with an independent CodeRabbit review already on it.

That is the version you install. The version Stripe installs runs this before they ship, so the change and the fix land together. Providers already know who is affected, from their own request logs. They just cannot fix it. Graft is the layer that can.
