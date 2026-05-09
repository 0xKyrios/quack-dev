import { FileText, Mic, ShieldCheck } from 'lucide-react'

import type { AnalysisResponse } from '../lib/types'
import { SourcesPanel } from './SourcesPanel'

const riskLabels: Record<string, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Urgent',
}

export type ChargeScreenProps = {
  analysis: AnalysisResponse
  onBack: () => void
  onStart: () => void
}

export function ChargeScreen({ analysis, onBack, onStart }: ChargeScreenProps) {
  const { chargeSheet, pr } = analysis

  return (
    <section className="charge-layout">
      <div className="charge-sheet" data-testid="charge-sheet">
        <div className="sheet-header">
          <FileText size={28} />
          <div>
            <p className="eyebrow">Review Summary</p>
            <h2>{chargeSheet.case_title}</h2>
          </div>
        </div>
        <div className={`risk-band risk-${chargeSheet.risk_level}`}>
          Risk level: {riskLabels[chargeSheet.risk_level] || chargeSheet.risk_level}
          {analysis.usedFallback ? ' / demo estimate' : ''}
        </div>

        <section>
          <h3>What changed?</h3>
          <p>{chargeSheet.charge}</p>
        </section>

        <section>
          <h3>Details from the diff</h3>
          <ul className="evidence-list">
            {chargeSheet.evidence.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section>
          <h3>Why it matters</h3>
          <p>{chargeSheet.summary}</p>
        </section>
      </div>

      <aside className="side-panel">
        <p className="eyebrow">Pull request</p>
        <h3>{pr.title}</h3>
        <dl className="stats-grid">
          <div>
            <dt>Files</dt>
            <dd>{pr.changedFiles}</dd>
          </div>
          <div>
            <dt>Additions</dt>
            <dd>+{pr.additions}</dd>
          </div>
          <div>
            <dt>Deletions</dt>
            <dd>-{pr.deletions}</dd>
          </div>
        </dl>

        <SourcesPanel
          sources={analysis.sources}
          connectorsUsed={analysis.connectorsUsed}
          compact
        />

        <div className="concept-list">
          {chargeSheet.concepts_to_test.map((concept) => (
            <div className="concept-row" key={concept.id}>
              <ShieldCheck size={16} />
              <span>{concept.concept}</span>
            </div>
          ))}
        </div>

        <div className="next-question-card">
          <p className="eyebrow">First check</p>
          <strong>{chargeSheet.concepts_to_test[0]?.concept || 'Changed behavior'}</strong>
          <p>{chargeSheet.concepts_to_test[0]?.question || 'Explain the riskiest part of this PR.'}</p>
        </div>

        <div className="button-stack">
          <button className="primary-button" data-testid="start-interrogation" onClick={onStart}>
            <Mic size={18} />
            Answer first question
          </button>
          <button className="ghost-button" onClick={onBack}>
            Try another pull request
          </button>
        </div>
      </aside>
    </section>
  )
}
