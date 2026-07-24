import { ExactMatch } from 'autoevals'
import type { EvalCase } from './dataset'

export type TaskOutput = {
  verdict: 'genuine' | 'false-positive' | 'not-found'
  reason: string
  provenance: string
  patchAfter: string | null
}

// Verdict accuracy. A false GENUINE (predicted genuine, actually a false positive) is the
// dangerous error: it rewrites working code into code that crashes. It scores 0. A missed
// genuine (predicted false-positive, actually genuine) leaves a bug unpatched but does not
// corrupt anything, so it scores partial credit instead of the same 0.
export function verdictAccuracy(args: { output: TaskOutput; expected: EvalCase }) {
  const { output, expected } = args
  if (output.verdict === expected.expectedVerdict) {
    return { name: 'verdict_accuracy', score: 1, metadata: { severity: 'correct' } }
  }
  if (output.verdict === 'genuine' && expected.expectedVerdict === 'false-positive') {
    return {
      name: 'verdict_accuracy',
      score: 0,
      metadata: { severity: 'false-genuine (dangerous: would corrupt working code)' },
    }
  }
  return {
    name: 'verdict_accuracy',
    score: 0.4,
    metadata: { severity: 'missed-genuine (bug left unpatched, no corruption)' },
  }
}

// Patch correctness, genuine cases only: does the rewrite produce exactly the expected
// line? Skipped (null) for false-positive ground truth, since there is nothing to patch.
export function patchCorrectness(args: { output: TaskOutput; expected: EvalCase }) {
  const { output, expected } = args
  if (expected.expectedVerdict !== 'genuine') return null
  if (!expected.expectedPatchAfter) return null // e.g. destructure case: no rewrite target exists
  if (output.verdict !== 'genuine' || output.patchAfter === null) {
    return { name: 'patch_correctness', score: 0, metadata: { reason: 'classifier missed the genuine case, no patch produced' } }
  }
  const result = ExactMatch({ output: output.patchAfter, expected: expected.expectedPatchAfter })
  return { ...result, name: 'patch_correctness' }
}
