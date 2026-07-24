// Wire format for the streaming pipeline endpoint (app/api/run/route.ts).
// Kept free of node-only imports so the client component can import the types.

export type LineVerdict = {
  file: string
  line: number
  text: string
  genuine: boolean
  reason: string
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
