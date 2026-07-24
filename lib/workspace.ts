import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import type { TargetRepo } from './types'

export async function ensureCloned(repo: TargetRepo): Promise<void> {
  if (existsSync(repo.localPath)) return
  execSync(`git clone --depth 1 ${repo.forkUrl} ${repo.localPath}`, { stdio: 'inherit' })
}
