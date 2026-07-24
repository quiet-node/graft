# Graft AI

Hackathon submission for Daytona HackSprint w/ Braintrust — SF, July 24 2026.

Project details, architecture, and feature scope: TBD.

## Hackathon context

This is a ~5-hour hackathon build. Favor fast, pragmatic execution — working code over polish, avoid over-engineering, don't get stuck deliberating over decisions that don't matter for a one-day demo.

All event info, schedule, rules, sponsor resources, submission requirements, and coupon codes live in `hackathon-resources/RESOURCES.md` — check there for anything event-specific.

## Sponsor tools — Claude Code integration reference

### Daytona (sandboxed code execution)
- No Claude Code plugin. MCP: `daytona mcp init claude` (after CLI install)
- CLI: `brew install daytonaio/cli/daytona`
- TS SDK: `npm install @daytona/sdk`
```ts
import { Daytona } from '@daytona/sdk'
const daytona = new Daytona()
const sandbox = await daytona.create({ language: 'typescript' })
const response = await sandbox.process.codeRun('...')
```

### Braintrust (eval/scoring)
- Claude Code plugins:
  - `claude plugin marketplace add braintrustdata/braintrust-claude-plugin`
  - `claude plugin install trace-claude-code@braintrust-claude-plugin` (confirmed)
  - `claude plugin install braintrust@braintrust-claude-plugin` (pattern-inferred, verify live before relying on it)
- MCP (read-only): `claude mcp add --transport http braintrust https://api.braintrust.dev/mcp --header "Authorization: Bearer $BRAINTRUST_API_KEY"`
- CLI (`bt`, docs' recommended default for coding agents): `curl -fsSL https://bt.dev/cli/install.sh | bash`
- TS SDK: `npm install braintrust autoevals`
```ts
import { Eval } from "braintrust";
import { ExactMatch } from "autoevals";
Eval("my-project", {
  data: () => [{ input: "hello", expected: "HELLO" }],
  task: async (input) => input.toUpperCase(),
  scores: [ExactMatch],
});
```

### CopilotKit (live agent UI)
- No Claude Code plugin/skill. MCP (docs/context only): `claude mcp add --transport sse copilotkit-mcp https://mcp.copilotkit.ai/sse`
- Install into existing app: `npm install @copilotkit/react-core @copilotkit/react-ui @copilotkit/runtime`
- `npx copilotkit@latest create` only scaffolds a brand-new project, not for adding to an existing app

### Fireworks AI (LLM backend)
- No Claude Code plugin/skill. Docs-search MCP: `claude mcp add --transport http fireworks-docs https://docs.fireworks.ai/mcp`
- Optional CLI-routing tool (FireConnect): `curl -fsSL https://raw.githubusercontent.com/fw-ai/fireconnect/main/install.sh | bash` then `fireconnect login && fireconnect claude on`
- Otherwise just the `openai` npm package, base_url `https://api.fireworks.ai/inference/v1`, key via `FIREWORKS_API_KEY`

### CodeRabbit (independent PR review)
- Claude Code plugin: CLI first (`curl -fsSL https://cli.coderabbit.ai/install.sh | sh`, then `coderabbit auth login`), then `claude plugin install coderabbit`
- Use inside session: `/coderabbit:review`, `/coderabbit:review uncommitted`, `/coderabbit:review committed`, `--base <branch>`
- Reviews local diffs live, not just PRs. Takes 7-30+ min depending on diff size — keep diffs small during the hackathon
