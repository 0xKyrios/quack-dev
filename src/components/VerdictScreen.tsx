import { useState } from 'react'
import { Clipboard } from 'lucide-react'

import type { VerdictResponse } from '../lib/types'

export type VerdictScreenProps = {
  verdict: VerdictResponse
  onRestart: () => void
}

const verdictDuckSrc = {
  merge_approved: '/generated-assets/duck-states/duck-approved.png',
  conditional_merge: '/generated-assets/duck-states/duck-warning.png',
  merge_denied: '/generated-assets/duck-states/duck-denied.png',
} satisfies Record<VerdictResponse['verdict'], string>

export function VerdictScreen({ verdict, onRestart }: VerdictScreenProps) {
  const [copied, setCopied] = useState(false)

  async function copyComment() {
    await navigator.clipboard.writeText(verdict.pr_comment)
    setCopied(true)
  }

  return (
    <section className="verdict-screen" data-testid="verdict-screen">
      <div className={`verdict-card verdict-${verdict.verdict}`}>
        <div className="verdict-card-copy">
          <p className="eyebrow">Review result</p>
          <h2>{verdict.headline}</h2>
          <p>
            {verdict.verdict === 'merge_approved'
              ? 'The pull request is understood well enough to move forward.'
              : verdict.verdict === 'conditional_merge'
                ? 'You understand part of the risk, but one answer still needs support.'
                : 'Pause before merging until the risky parts can be explained clearly.'}
          </p>
        </div>
        <div className="verdict-duck-stage" aria-hidden="true">
          <img src={verdictDuckSrc[verdict.verdict]} width={220} height={220} alt="" />
        </div>
      </div>

      <div className="verdict-columns">
        <section>
          <h3>Needs clarification</h3>
          {verdict.failed.length ? (
            <ul className="evidence-list">
              {verdict.failed.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : (
            <p>No unresolved concepts.</p>
          )}
        </section>
        <section>
          <h3>Required follow-ups</h3>
          {verdict.required_actions.length ? (
            <ol className="required-list">
              {verdict.required_actions.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
          ) : (
            <p>No required actions.</p>
          )}
        </section>
      </div>

      <section className="comment-box">
        <div className="comment-header">
          <h3>Review comment</h3>
          <button className="ghost-button" data-testid="copy-comment" onClick={copyComment}>
            <Clipboard size={16} />
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <pre>{verdict.pr_comment}</pre>
      </section>

      <button className="primary-button" onClick={onRestart}>
        Review another pull request
      </button>
    </section>
  )
}
