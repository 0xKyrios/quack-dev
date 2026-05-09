import { demoChargeSheet } from './demo'
import type { ChargeSheet, ConceptCheck, PrSnapshot, RiskLevel } from './types'

const riskKeywords: Array<{ pattern: RegExp; concept: string; severity: RiskLevel }> = [
  { pattern: /retry|timeout|backoff/i, concept: 'Retry logic', severity: 'high' },
  { pattern: /payment|billing|charge|invoice/i, concept: 'Payment side effects', severity: 'critical' },
  { pattern: /auth|token|session|jwt|cookie/i, concept: 'Auth/session behavior', severity: 'high' },
  { pattern: /migration|schema|alter table|create table/i, concept: 'Database migration', severity: 'high' },
  { pattern: /permission|role|admin|authorize|policy/i, concept: 'Permissions/security', severity: 'high' },
  { pattern: /cache|ttl|invalidate/i, concept: 'Caching correctness', severity: 'medium' },
  { pattern: /queue|job|worker|cron/i, concept: 'Background job behavior', severity: 'medium' },
  { pattern: /delete|destroy|remove|drop/i, concept: 'Destructive change', severity: 'high' },
  { pattern: /\.env|config|secret|process\.env/i, concept: 'Environment/config change', severity: 'medium' },
]

export function compactSnapshot(snapshot: PrSnapshot) {
  return {
    title: snapshot.title,
    body: snapshot.body,
    author: snapshot.author,
    stats: {
      additions: snapshot.additions,
      deletions: snapshot.deletions,
      changedFiles: snapshot.changedFiles,
    },
    files: snapshot.files.map((file) => ({
      filename: file.filename,
      status: file.status,
      additions: file.additions,
      deletions: file.deletions,
      patch: file.patch?.slice(0, 6000),
    })),
    commits: snapshot.commits.map((commit) => ({
      sha: commit.sha.slice(0, 7),
      message: commit.message,
      author: commit.author,
    })),
  }
}

function snapshotText(snapshot: PrSnapshot) {
  return [
    snapshot.title,
    snapshot.body,
    ...snapshot.files.flatMap((file) => [file.filename, file.patch || '']),
    ...snapshot.commits.map((commit) => commit.message),
  ].join('\n')
}

function riskForConcept(concept: string): ConceptCheck {
  const normalized = concept.toLowerCase().replace(/[^a-z0-9]+/g, '-')

  if (concept.includes('Payment') || concept.includes('Retry')) {
    return {
      id: normalized,
      concept,
      severity: concept.includes('Payment') ? 'critical' : 'high',
      question:
        'What happens if the first request succeeds, but the client times out before receiving the response?',
      expected_answer:
        'The answer must identify idempotency or deduplication as the mechanism that prevents duplicate side effects.',
      follow_up_if_weak:
        'You said probably. The duck does not accept probably. What exact mechanism prevents the duplicate?',
      status: 'unverified',
    }
  }

  if (concept.includes('Auth')) {
    return {
      id: normalized,
      concept,
      severity: 'high',
      question:
        'What prevents token leakage or stale session use after this change?',
      expected_answer:
        'The answer should describe where token storage, refresh failure, and session invalidation are enforced.',
      follow_up_if_weak:
        'Name the trust boundary and the code path that enforces it.',
      status: 'unverified',
    }
  }

  if (concept.includes('Database')) {
    return {
      id: normalized,
      concept,
      severity: 'high',
      question:
        'Is this migration reversible, and what happens if it runs twice?',
      expected_answer:
        'The answer should cover rollback behavior, idempotency, and impact on existing rows.',
      follow_up_if_weak:
        'A migration is not harmless because it runs once on your laptop. What protects production data?',
      status: 'unverified',
    }
  }

  return {
    id: normalized,
    concept,
    severity: 'medium',
    question: `What changed about ${concept}, and what is the worst credible production failure?`,
    expected_answer:
      'The answer should identify the changed trust boundary, side effect, or invariant, plus a concrete failure mode.',
    follow_up_if_weak:
      'That answer has confidence. Unfortunately, it lacks evidence. Point to the invariant.',
    status: 'unverified',
  }
}

export function heuristicChargeSheet(snapshot: PrSnapshot): ChargeSheet {
  const text = snapshotText(snapshot)
  const concepts = riskKeywords
    .filter((item) => item.pattern.test(text))
    .map((item) => item.concept)

  const uniqueConcepts = [...new Set(concepts)]
  const selectedConcepts = uniqueConcepts.length
    ? uniqueConcepts.slice(0, 4)
    : ['Changed behavior', 'Missing tests']

  const evidence = snapshot.files.slice(0, 6).map((file) => {
    const patchHint = file.patch
      ? file.patch
          .split('\n')
          .find((line) => line.startsWith('+') && !line.startsWith('+++'))
      : undefined
    return `${file.filename} changed ${file.additions}+/${file.deletions}-.${patchHint ? ` Notable line: ${patchHint.slice(0, 120)}` : ''}`
  })

  const riskLevel: RiskLevel = selectedConcepts.some((concept) =>
    /payment|billing|destructive/i.test(concept),
  )
    ? 'critical'
    : selectedConcepts.some((concept) => /retry|auth|database|permission/i.test(concept))
      ? 'high'
      : 'medium'

  return {
    case_title: `CASE #${snapshot.input.number}: The Duck v. ${snapshot.title.slice(0, 54)}`,
    charge: `Attempted merge of ${selectedConcepts[0].toLowerCase()} without proving the human understands the risk.`,
    summary:
      snapshot.body ||
      `This PR changes ${snapshot.changedFiles} files with ${snapshot.additions} additions and ${snapshot.deletions} deletions.`,
    risk_level: riskLevel,
    evidence: evidence.length ? evidence : demoChargeSheet.evidence,
    concepts_to_test: selectedConcepts.map(riskForConcept),
  }
}

export function normalizeChargeSheet(
  candidate: Partial<ChargeSheet> | null | undefined,
  snapshot: PrSnapshot,
): ChargeSheet {
  const fallback = heuristicChargeSheet(snapshot)
  const concepts =
    candidate?.concepts_to_test && candidate.concepts_to_test.length > 0
      ? candidate.concepts_to_test
      : fallback.concepts_to_test

  return {
    case_title: candidate?.case_title || fallback.case_title,
    charge: candidate?.charge || fallback.charge,
    summary: candidate?.summary || fallback.summary,
    risk_level: candidate?.risk_level || fallback.risk_level,
    evidence: candidate?.evidence?.length ? candidate.evidence : fallback.evidence,
    concepts_to_test: concepts.slice(0, 5).map((concept, index) => ({
      id:
        concept.id ||
        `${concept.concept || 'concept'}-${index}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      concept: concept.concept || fallback.concepts_to_test[index]?.concept || 'Changed behavior',
      severity: concept.severity || fallback.concepts_to_test[index]?.severity || 'medium',
      question:
        concept.question || fallback.concepts_to_test[index]?.question || 'Explain the risky change.',
      expected_answer:
        concept.expected_answer ||
        fallback.concepts_to_test[index]?.expected_answer ||
        'A correct answer must identify the concrete invariant and evidence.',
      follow_up_if_weak:
        concept.follow_up_if_weak ||
        fallback.concepts_to_test[index]?.follow_up_if_weak ||
        'Show me the invariant, not the vibe.',
      status: 'unverified',
      reason: concept.reason,
    })),
  }
}

export const chargeSheetSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['case_title', 'charge', 'summary', 'risk_level', 'evidence', 'concepts_to_test'],
  properties: {
    case_title: { type: 'string' },
    charge: { type: 'string' },
    summary: { type: 'string' },
    risk_level: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
    evidence: {
      type: 'array',
      items: { type: 'string' },
      minItems: 3,
      maxItems: 8,
    },
    concepts_to_test: {
      type: 'array',
      minItems: 2,
      maxItems: 5,
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'id',
          'concept',
          'severity',
          'question',
          'expected_answer',
          'follow_up_if_weak',
          'status',
        ],
        properties: {
          id: { type: 'string' },
          concept: { type: 'string' },
          severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
          question: { type: 'string' },
          expected_answer: { type: 'string' },
          follow_up_if_weak: { type: 'string' },
          status: { type: 'string', enum: ['unverified'] },
        },
      },
    },
  },
} as const
