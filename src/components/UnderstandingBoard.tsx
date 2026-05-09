import { useMemo } from 'react'

import type { ConceptCheck, ConceptStatus } from '../lib/types'

const riskLabels: Record<string, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Urgent',
}

export type UnderstandingBoardProps = {
  board: Record<ConceptStatus, ConceptCheck[]>
  concepts: ConceptCheck[]
  currentConceptId?: string
}

export type BoardGroupProps = {
  label: string
  subtitle?: string
  items: ConceptCheck[]
  status: ConceptStatus
  ordinalFor?: (id: string) => number | null
  currentConceptId?: string
  showQuestionTeaser?: boolean
  emptyHint?: string
}

function BoardGroup({
  label,
  subtitle,
  items,
  status,
  ordinalFor,
  currentConceptId,
  showQuestionTeaser,
  emptyHint,
}: BoardGroupProps) {
  return (
    <div className="board-group">
      <h4>{label}</h4>
      {subtitle ? <p className="board-group-sub">{subtitle}</p> : null}
      {items.length ? (
        items.map((item) => {
          const n = ordinalFor?.(item.id)
          const teaser =
            showQuestionTeaser && item.question && item.question.length > 118
              ? `${item.question.slice(0, 115)}…`
              : item.question
          return (
            <div
              className={`board-item status-${status} ${item.id === currentConceptId ? 'is-current' : ''}`}
              key={item.id}
            >
              <div className="board-item-top">
                {n != null ? <span className="board-idx">{n}</span> : null}
                <span className="board-concept-name">{item.concept}</span>
                <span className={`board-sev sev-${item.severity}`}>
                  {riskLabels[item.severity] ?? item.severity}
                </span>
              </div>
              {showQuestionTeaser && teaser ? (
                <p className="board-teaser">{teaser}</p>
              ) : null}
              {item.reason ? <small className="board-reason">{item.reason}</small> : null}
            </div>
          )
        })
      ) : emptyHint ? (
        <p className="empty-state">{emptyHint}</p>
      ) : (
        <p className="empty-state">None yet.</p>
      )}
    </div>
  )
}

export function UnderstandingBoard({
  board,
  concepts,
  currentConceptId,
}: UnderstandingBoardProps) {
  const understood = board.passed.length
  const failed = board.failed.length
  const weak = board.weak.length
  const needsWork = failed + weak
  const queued = board.unverified.length
  const total = understood + needsWork + queued
  const progress = total ? Math.round((understood / total) * 100) : 0

  const conceptOrderIdx = useMemo(() => {
    const m = new Map<string, number>()
    concepts.forEach((c, i) => m.set(c.id, i))
    return m
  }, [concepts])

  const sortByConceptOrder = (items: ConceptCheck[]) =>
    [...items].sort(
      (a, b) => (conceptOrderIdx.get(a.id) ?? 0) - (conceptOrderIdx.get(b.id) ?? 0),
    )

  const unverifiedSorted = sortByConceptOrder(board.unverified)
  const activeConcept =
    currentConceptId != null
      ? concepts.find((c) => c.id === currentConceptId && c.status === 'unverified')
      : undefined

  function ordinalFor(id: string) {
    const i = concepts.findIndex((c) => c.id === id)
    return i >= 0 ? i + 1 : null
  }

  return (
    <aside className="board-panel" data-testid="understanding-board">
      <p className="eyebrow">Concepts</p>
      <div className="progress-card">
        <strong>{understood}/{total} clear</strong>
        <div className="progress-track">
          <span style={{ width: `${progress}%` }} />
        </div>
        <small className="progress-card-meta">
          {queued ? `${queued} in queue · ` : ''}
          {needsWork ? `${needsWork} need follow-up · ` : ''}
          Unlock a solid review note by clearing each concept.
        </small>
      </div>

      {activeConcept ? (
        <div className="board-active-card" aria-live="polite">
          <p className="eyebrow board-active-eyebrow">Active check</p>
          <div className="board-active-head">
            <span className="board-idx">{ordinalFor(activeConcept.id)}</span>
            <strong className="board-active-title">{activeConcept.concept}</strong>
            <span className={`board-sev sev-${activeConcept.severity}`}>
              {riskLabels[activeConcept.severity] || activeConcept.severity}
            </span>
          </div>
          <p className="board-active-question">{activeConcept.question}</p>
        </div>
      ) : null}

      {board.passed.length ? (
        <BoardGroup label="Clear" items={sortByConceptOrder(board.passed)} status="passed" ordinalFor={ordinalFor} />
      ) : null}

      {board.failed.length ? (
        <BoardGroup
          label="Blocked"
          subtitle="Explain before merging"
          items={sortByConceptOrder(board.failed)}
          status="failed"
          ordinalFor={ordinalFor}
        />
      ) : null}

      {board.weak.length ? (
        <BoardGroup
          label="Shaky"
          subtitle="Add mechanism, invariant, or test"
          items={sortByConceptOrder(board.weak)}
          status="weak"
          ordinalFor={ordinalFor}
        />
      ) : null}

      <BoardGroup
        label={queued ? 'Up next' : 'All caught up'}
        items={unverifiedSorted}
        status="unverified"
        ordinalFor={ordinalFor}
        currentConceptId={currentConceptId}
        showQuestionTeaser={queued > 0}
        emptyHint={queued ? undefined : 'Every concept in this trial has been checked.'}
      />
    </aside>
  )
}
