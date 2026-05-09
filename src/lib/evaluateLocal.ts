import type { ConceptCheck, EvaluationResponse } from './types'

export function evaluateAnswerInBrowser(
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
        'The answer is too short or vague to show understanding of the risky mechanism.',
      duck_reply:
        'That answer needs more detail. Name the mechanism and point to the supporting code or test.',
    }
  }

  if (hasStrongSignal) {
    return {
      status: 'passed',
      reason: `The answer identified a concrete mechanism relevant to ${concept.concept}.`,
      duck_reply:
        'That works. You named a concrete mechanism and connected it to the risk.',
    }
  }

  return {
    status: 'failed',
    reason:
      'The answer did not identify a concrete mechanism, safeguard, or test showing the risk is controlled.',
    duck_reply:
      'Your explanation needs supporting detail. Point to the safeguard or test that controls the risk.',
  }
}
