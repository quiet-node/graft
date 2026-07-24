export type TargetRepo = {
  id: string
  name: string // e.g. "BloomTech-Labs/decisionjam"
  forkUrl: string // Logan fills these in, leave as empty string for now
  localPath: string // workspace/<id>, where the pipeline clones the repo locally
  file: string // e.g. "server/Payments.js"
  line: number
  snippet: string // the exact affected line of source
  expectedVerdict: 'genuine' | 'false-positive'
}

export type BreakingChange = {
  kind: 'field-removed'
  severity: 'breaking'
  schema: string
  field: string
  movedTo: string
  oldAccessor: string
  newAccessor: string
  changelogUrl: string
}
