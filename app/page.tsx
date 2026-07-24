import specDiff from '@/data/spec-diff.json'
import { loadBreakingChanges } from '@/lib/detect'
import DashboardClient from './dashboard-client'

export default function DashboardPage() {
  const copilotEnabled = Boolean(process.env.FIREWORKS_API_KEY)
  const change = loadBreakingChanges().find((c) => c.field === 'current_period_end')
  if (!change) throw new Error('current_period_end breaking change not found in spec-diff.json')

  return (
    <DashboardClient
      copilotEnabled={copilotEnabled}
      change={change}
      provider={specDiff.provider}
      apiVersion={specDiff.apiVersion}
    />
  )
}
