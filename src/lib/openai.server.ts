import { chargeSheetSchema, compactSnapshot, normalizeChargeSheet } from './analysis'
import type {
  AnalysisSource,
  ChargeSheet,
  ConceptCheck,
  EvaluationResponse,
  PrSnapshot,
  VerdictResponse,
} from './types'

const analysisModel = process.env.OPENAI_ANALYSIS_MODEL || 'gpt-5.4-mini'
const realtimeModel = process.env.OPENAI_REALTIME_MODEL || 'gpt-realtime'

function requireOpenAiKey() {
  const key = process.env.OPENAI_API_KEY
  if (!key) {
    throw new Error('OPENAI_API_KEY is not configured.')
  }
  return key
}

function extractOutputText(payload: any): string {
  if (typeof payload.output_text === 'string') {
    return payload.output_text
  }

  const parts =
    payload.output
      ?.flatMap((item: any) => item.content || [])
      ?.map((content: any) => content.text || '')
      ?.filter(Boolean) || []

  return parts.join('\n')
}

async function callResponsesApi(body: Record<string, unknown>, timeoutMs = 45000) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${requireOpenAiKey()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new Error(`OpenAI returned ${response.status}. ${detail}`)
    }

    return response.json()
  } finally {
    clearTimeout(timeout)
  }
}

export async function analyzePrWithOpenAi(
  snapshot: PrSnapshot,
  sources: AnalysisSource[] = [],
): Promise<ChargeSheet> {
  const payload = await callResponsesApi({
    model: analysisModel,
    input: [
      {
        role: 'system',
        content:
          'You are quack dev, a sharp but helpful engineering duck. Your job is not normal code review. You inspect a PR diff and produce a concise review summary that tests whether the human understands the risky change. Avoid courtroom language. Be playful, but keep the engineering critique real.',
      },
      {
        role: 'user',
        content: JSON.stringify({
          instructions: [
            'Inspect this public GitHub PR snapshot.',
            'Use the external risk context only when it is directly relevant to the diff.',
            'Find risky or confusing changes.',
            'Prefer concepts involving retry logic, payment/billing, auth/session, database migrations, permissions/security, concurrency/race conditions, caching, background jobs, deletion/destructive changes, missing tests, and env/config changes.',
            'Write questions that force the developer to explain mechanisms, invariants, and evidence.',
            'Return only JSON matching the schema.',
          ],
          pr: compactSnapshot(snapshot),
          external_risk_context: sources.map((source) => ({
            title: source.title,
            url: source.url,
            snippet: source.snippet,
          })),
        }),
      },
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'quack_dev_review_summary',
        strict: true,
        schema: chargeSheetSchema,
      },
    },
  })

  const text = extractOutputText(payload)
  return normalizeChargeSheet(JSON.parse(text), snapshot)
}

export function evaluateAnswerLocally(
  concept: ConceptCheck,
  answer: string,
): EvaluationResponse {
  const normalized = answer.toLowerCase()
  const strongSignals = [
    'idempot',
    'dedupe',
    'deduplicate',
    'invariant',
    'test',
    'rollback',
    'authorization',
    'permission',
    'invalidate',
    'race',
    'lock',
    'transaction',
  ]
  const weakSignals = ['probably', 'should', 'maybe', 'i think', 'fine', 'hope']
  const hasStrongSignal = strongSignals.some((signal) => normalized.includes(signal))
  const hasWeakSignal = weakSignals.some((signal) => normalized.includes(signal))

  if (answer.trim().length < 28 || (hasWeakSignal && !hasStrongSignal)) {
    return {
      status: 'weak',
      reason:
        'The answer is too vague or relies on probability instead of a concrete mechanism.',
      duck_reply:
        'You said probably. The duck does not accept probably. Name the invariant and point to the evidence.',
    }
  }

  if (hasStrongSignal) {
    return {
      status: 'passed',
      reason: `The answer identified a concrete mechanism relevant to ${concept.concept}.`,
      duck_reply:
        'Accepted. You found an actual mechanism instead of waving at the blast radius.',
    }
  }

  return {
    status: 'failed',
    reason:
      'The answer did not identify a concrete mechanism, invariant, or test proving the risk is controlled.',
    duck_reply:
      'Your explanation has confidence. Unfortunately, it lacks evidence. Merge confidence is not a control.',
  }
}

export async function evaluateAnswerWithOpenAi(
  concept: ConceptCheck,
  answer: string,
  transcript: string[],
): Promise<EvaluationResponse> {
  if (!process.env.OPENAI_API_KEY) {
    return evaluateAnswerLocally(concept, answer)
  }

  try {
    const payload = await callResponsesApi({
      model: analysisModel,
      input: [
        {
          role: 'system',
          content:
            'You are quack dev. Evaluate whether a developer answer proves understanding. Be direct, concise, and technically serious. Return strict JSON.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            concept,
            answer,
            recent_transcript: transcript.slice(-8),
          }),
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'quack_dev_answer_evaluation',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            required: ['status', 'reason', 'duck_reply'],
            properties: {
              status: { type: 'string', enum: ['passed', 'weak', 'failed'] },
              reason: { type: 'string' },
              duck_reply: { type: 'string' },
            },
          },
        },
      },
    }, 12000)

    return JSON.parse(extractOutputText(payload)) as EvaluationResponse
  } catch {
    return evaluateAnswerLocally(concept, answer)
  }
}

export function generateVerdict(concepts: ConceptCheck[], title: string): VerdictResponse {
  const passed = concepts
    .filter((concept) => concept.status === 'passed')
    .map((concept) => concept.concept)
  const failed = concepts
    .filter((concept) => concept.status === 'failed' || concept.status === 'weak')
    .map((concept) => concept.concept)
  const unverified = concepts
    .filter((concept) => concept.status === 'unverified')
    .map((concept) => concept.concept)

  const verdict =
    failed.length > 1 || concepts.some((concept) => concept.status === 'failed')
      ? 'merge_denied'
      : failed.length === 1 || unverified.length > 0
        ? 'conditional_merge'
        : 'merge_approved'

  const headline =
    verdict === 'merge_approved'
      ? 'MERGE APPROVED'
      : verdict === 'conditional_merge'
        ? 'CONDITIONAL MERGE'
        : 'MERGE DENIED'

  const required_actions = failed.length
    ? failed.map((concept) => `Add proof or documentation for: ${concept}`)
    : unverified.map((concept) => `Finish quack dev check for: ${concept}`)

  const pr_comment = [
    `quack dev verdict: ${headline}`,
    '',
    `PR: ${title}`,
    '',
    passed.length ? `Passed understanding checks:\n${passed.map((item) => `- ${item}`).join('\n')}` : '',
    failed.length ? `Outstanding weak or failed concepts:\n${failed.map((item) => `- ${item}`).join('\n')}` : '',
    required_actions.length
      ? `Required before merge:\n${required_actions.map((item) => `- ${item}`).join('\n')}`
      : 'Required before merge:\n- Nothing. Understanding checks passed.',
  ]
    .filter(Boolean)
    .join('\n')

  return {
    verdict,
    headline,
    passed,
    failed: [...failed, ...unverified],
    required_actions,
    pr_comment,
  }
}

export async function createRealtimeSession(chargeSheet: ChargeSheet) {
  const response = await fetch('https://api.openai.com/v1/realtime/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${requireOpenAiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: realtimeModel,
      voice: process.env.OPENAI_REALTIME_VOICE || 'verse',
      input_audio_transcription: {
        model: process.env.OPENAI_REALTIME_TRANSCRIPTION_MODEL || 'gpt-4o-transcribe',
        prompt:
          'Transcribe concise software engineering discussion about pull requests, payment retries, idempotency keys, tests, and code review.',
      },
      instructions: [
        'You are the quack dev understanding-check duck.',
        'You review human understanding, not just code.',
        'Be playful, direct, and helpful.',
        'Ask one question at a time from the supplied review summary.',
        'Reject vague answers. Ask for mechanisms, invariants, and tests.',
        'Keep responses under three sentences.',
        `Review summary: ${JSON.stringify(chargeSheet)}`,
      ].join('\n'),
    }),
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`Realtime session failed: ${response.status}. ${detail}`)
  }

  return response.json()
}
