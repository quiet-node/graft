// Wire format for the streaming pipeline endpoint (app/api/run/route.ts).
// Kept free of node-only imports so the client component can import the types.

// A line is in exactly one of three states: genuine (a real breakage), rejected (judged not
// a Stripe Subscription read), or classifier-failed. The third state exists because a
// classifier call that never completed produced no judgement at all, and counting it as a
// rejection would report a verdict the pipeline never reached.
export type LineVerdict = {
  file: string
  line: number
  text: string
  genuine: boolean
  reason: string
  classifierFailed?: true
  patch?: { before: string; after: string }
  patchError?: string
}

export type ProofResult = {
  before: string
  after: string
  passed: boolean
}

export type RunEvent =
  | { type: 'run-start'; repoIds: string[] }
  | { type: 'repo-done'; repoId: string; verdicts: LineVerdict[] }
  | { type: 'repo-error'; repoId: string; message: string }
  | { type: 'proof'; proof: ProofResult }
  | { type: 'proof-error'; message: string }
  | { type: 'done' }
