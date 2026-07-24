import spec3Diff from '@/data/spec-diff.json'
import { BreakingChange } from './types'

export function loadBreakingChanges(): BreakingChange[] {
  return spec3Diff.changes as BreakingChange[]
}
