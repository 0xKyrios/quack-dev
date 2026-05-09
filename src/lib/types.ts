export type RiskLevel = 'low' | 'medium' | 'high' | 'critical'
export type ConceptStatus = 'passed' | 'weak' | 'failed' | 'unverified'
export type VerdictKind = 'merge_approved' | 'conditional_merge' | 'merge_denied'

export type PullRequestInput = {
  owner: string
  repo: string
  number: number
  url: string
}

export type PrFile = {
  filename: string
  status: string
  additions: number
  deletions: number
  changes: number
  patch?: string
}

export type PrCommit = {
  sha: string
  message: string
  author?: string
}

export type PrSnapshot = {
  input: PullRequestInput
  title: string
  body: string
  author: string
  additions: number
  deletions: number
  changedFiles: number
  htmlUrl: string
  files: PrFile[]
  commits: PrCommit[]
}

export type ConceptCheck = {
  id: string
  concept: string
  severity: RiskLevel
  question: string
  expected_answer: string
  follow_up_if_weak: string
  status: ConceptStatus
  reason?: string
}

export type ChargeSheet = {
  case_title: string
  charge: string
  summary: string
  risk_level: RiskLevel
  evidence: string[]
  concepts_to_test: ConceptCheck[]
}

export type AnalysisResponse = {
  pr: PrSnapshot
  chargeSheet: ChargeSheet
  usedFallback: boolean
}

export type EvaluationResponse = {
  status: Exclude<ConceptStatus, 'unverified'>
  reason: string
  duck_reply: string
}

export type VerdictResponse = {
  verdict: VerdictKind
  headline: string
  passed: string[]
  failed: string[]
  required_actions: string[]
  pr_comment: string
}
