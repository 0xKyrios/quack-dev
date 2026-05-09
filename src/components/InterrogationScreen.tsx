import { Fragment } from 'react'
import { CheckCircle2, Loader2, MessageSquare, Mic, Sparkles } from 'lucide-react'

import type {
  ChargeSheet,
  AnalysisSource,
  ConnectorUsage,
  ConceptCheck,
  ConceptStatus,
} from '../lib/types'

import { SourcesPanel } from './SourcesPanel'
import { UnderstandingBoard } from './UnderstandingBoard'

export type TranscriptLine = {
  speaker: 'duck' | 'developer' | 'system'
  text: string
}

const riskLabels: Record<string, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Urgent',
}

const voiceStateLabels: Record<'idle' | 'connecting' | 'live' | 'fallback', string> = {
  idle: 'Voice ready',
  connecting: 'Connecting…',
  live: 'Session live',
  fallback: 'Voice unavailable',
}

const transcriptSpeakerLabels: Record<TranscriptLine['speaker'], string> = {
  duck: 'quack dev',
  developer: 'You',
  system: 'Status',
}

const checkingStatusText = 'quack dev is checking your answer against the review summary.'
const duckMascotSrc = '/generated-assets/rubber-duck-mascot.png'
const duckListeningSrc = '/generated-assets/duck-states/duck-listening.png'
const duckSpeakingSrc = '/generated-assets/duck-states/duck-speaking.png'
const duckThinkingSrc = '/generated-assets/duck-states/duck-thinking.png'

export type InterrogationScreenProps = {
  chargeSheet: ChargeSheet
  sources: AnalysisSource[]
  connectorsUsed: ConnectorUsage[]
  concepts: ConceptCheck[]
  currentConcept?: ConceptCheck
  currentIndex: number
  board: Record<ConceptStatus, ConceptCheck[]>
  transcript: TranscriptLine[]
  answer: string
  voiceInputDraft: string
  setAnswer: (value: string) => void
  isEvaluating: boolean
  voiceState: 'idle' | 'connecting' | 'live' | 'fallback'
  answerMode: 'text' | 'voice'
  onSelectAnswerMode: (mode: 'text' | 'voice') => void
  onSubmitAnswer: () => void
  onVerdict: () => void
  isLoading: boolean
}

export function InterrogationScreen({
  chargeSheet,
  sources,
  connectorsUsed,
  concepts,
  currentConcept,
  currentIndex,
  board,
  transcript,
  answer,
  voiceInputDraft,
  setAnswer,
  isEvaluating,
  voiceState,
  answerMode,
  onSelectAnswerMode,
  onSubmitAnswer,
  onVerdict,
  isLoading,
}: InterrogationScreenProps) {
  const voiceSessionActive = answerMode === 'voice' && (voiceState === 'connecting' || voiceState === 'live')
  const latestDuckLine = [...transcript].reverse().find((line) => line.speaker === 'duck')
  const duckIsSpeaking = Boolean(latestDuckLine) && !isEvaluating && !(answerMode === 'voice' && voiceState === 'live')
  const activeDuckSrc = isEvaluating
    ? duckThinkingSrc
    : answerMode === 'voice' && voiceState === 'live'
      ? duckListeningSrc
      : duckIsSpeaking
        ? duckSpeakingSrc
        : duckMascotSrc
  const duckStageClass = [
    'duck-conversation-stage',
    voiceSessionActive ? 'duck-conversation-stage-live' : '',
    duckIsSpeaking ? 'duck-conversation-stage-speaking' : '',
    isEvaluating ? 'duck-conversation-stage-thinking' : '',
  ].filter(Boolean).join(' ')

  return (
    <section className="interrogation-grid interrogation-grid-has-fixed-bar">
      <UnderstandingBoard
        board={board}
        concepts={concepts}
        currentConceptId={currentConcept?.id}
      />

      <aside className="evidence-panel">
        <p className="eyebrow">Diff details</p>
        <h3>{chargeSheet.charge}</h3>
        <ul className="evidence-list compact">
          {chargeSheet.evidence.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <SourcesPanel sources={sources} connectorsUsed={connectorsUsed} compact />
      </aside>

      <div className="chat-panel">
        <div className="chat-panel-header">
          <div className="chat-title">
            <div
              className={`duck-avatar-wrap ${voiceSessionActive ? 'duck-voice-active' : ''}`}
              aria-hidden="true"
            >
              <img
                className="duck-mascot"
                src={activeDuckSrc}
                width={88}
                height={88}
                alt=""
              />
            </div>
            <div>
              <p className="eyebrow">Understanding check</p>
              <h2>Chat through the risky parts.</h2>
            </div>
          </div>

          <div className="answer-mode-switch" role="group" aria-label="Answer mode">
            <button
              type="button"
              className={`answer-mode-tab ${answerMode === 'text' ? 'is-active' : ''}`}
              aria-pressed={answerMode === 'text'}
              data-testid="answer-mode-text"
              onClick={() => onSelectAnswerMode('text')}
            >
              <MessageSquare size={16} strokeWidth={2.25} />
              Type
            </button>
            <button
              type="button"
              className={`answer-mode-tab ${answerMode === 'voice' ? 'is-active' : ''}`}
              aria-pressed={answerMode === 'voice'}
              data-testid="answer-mode-voice"
              disabled={isEvaluating || isLoading || voiceState === 'connecting'}
              onClick={() => onSelectAnswerMode('voice')}
            >
              <Mic size={16} strokeWidth={2.25} />
              Voice
            </button>
          </div>
        </div>

        <div className="chat-scroll">
          <div className={duckStageClass}>
            <div className="duck-stage-orbit" aria-hidden="true">
              <img
                className="duck-stage-mascot"
                src={activeDuckSrc}
                width={180}
                height={180}
                alt=""
              />
            </div>
            <div className="duck-stage-copy">
              <div className="duck-stage-meta">
                <span>quack dev</span>
                <span>{answerMode === 'voice' ? voiceStateLabels[voiceState] : 'Text chat'}</span>
              </div>
              <p>
                {latestDuckLine?.text ||
                  currentConcept?.question ||
                  'Answer the pinned question to start talking with the duck.'}
              </p>
            </div>
          </div>

          <div className="transcript-panel">
            <p className="eyebrow">Conversation</p>
            <p className="transcript-panel-hint">Questions, answers, and model feedback in one thread.</p>
            <div className="transcript-log" data-testid="transcript-log">
              {transcript.every((line) => line.speaker === 'system') ? (
                <p className="line-system transcript-empty-state">
                  <span className="transcript-meta">
                    <strong>Status</strong>
                    <span>Waiting</span>
                  </span>
                  <span className="transcript-text">Answer the pinned question below to start the conversation.</span>
                </p>
              ) : null}
              {transcript.map((line, index) => (
                <p
                  key={`${line.speaker}-${index}`}
                  className={`line-${line.speaker}${line.text === checkingStatusText ? ' line-system-transient' : ''}`}
                >
                  <span className="transcript-meta">
                    <strong>{transcriptSpeakerLabels[line.speaker]}</strong>
                    <span>{line.speaker === 'duck' ? 'Assistant' : line.speaker === 'developer' ? 'Speaker' : 'System'}</span>
                  </span>
                  <span className="transcript-text">{line.text}</span>
                </p>
              ))}
              {answer.trim() ? (
                <p className="line-developer transcript-draft">
                  <span className="transcript-meta">
                    <strong>You</strong>
                    <span>Draft</span>
                  </span>
                  <span className="transcript-text">{answer}</span>
                </p>
              ) : null}
              {voiceInputDraft.trim() ? (
                <p className="line-developer transcript-draft">
                  <span className="transcript-meta">
                    <strong>You</strong>
                    <span>Listening</span>
                  </span>
                  <span className="transcript-text">{voiceInputDraft}</span>
                </p>
              ) : null}
            </div>
          </div>
        </div>

        <div className="chat-composer">
          <div className="question-block pinned-question" data-testid="current-question">
            <p className="eyebrow">Question {Math.min(currentIndex + 1, concepts.length)} of {concepts.length}</p>
            <h2>{currentConcept?.question || 'Question ready.'}</h2>
            <p>
              {currentConcept?.follow_up_if_weak ||
                'Explain the mechanism, safeguard, or test coverage.'}
            </p>
          </div>

          {answerMode === 'voice' ? (
            <div className="voice-status-row">
              <span
                className={`voice-dot ${voiceState}${voiceState === 'live' ? ' voice-dot-pulse' : ''}`}
                role="status"
                aria-live="polite"
                aria-atomic="true"
              >
                {voiceState === 'live' ? (
                  <Fragment>
                    <span className="voice-live-dot" aria-hidden />
                    <span className="voice-wave-meter" aria-hidden>
                      <span />
                      <span />
                      <span />
                      <span />
                    </span>
                  </Fragment>
                ) : null}
                {voiceState === 'connecting' ? (
                  <Loader2 className="spin voice-dot-spinner" size={14} aria-hidden />
                ) : null}
                <span className="voice-dot-label">{voiceStateLabels[voiceState]}</span>
              </span>
              <button
                type="button"
                className="ghost-link"
                title="Switch to typing and close the voice session"
                onClick={() => onSelectAnswerMode('text')}
              >
                End voice
              </button>
            </div>
          ) : (
            <p className="voice-hint">Tap Voice to speak with realtime quack dev — microphone access required.</p>
          )}

          <div className="typed-answer">
            <textarea
              data-testid="answer-input"
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              placeholder={
                answerMode === 'voice'
                  ? 'Optional — type here if you want to submit text, or speak and use transcript + submit.'
                  : 'Explain the safeguard, mechanism, or missing test...'
              }
            />
            <button
              className="primary-button"
              data-testid="submit-answer"
              onClick={onSubmitAnswer}
              disabled={isEvaluating || !answer.trim()}
            >
              {isEvaluating ? <Loader2 className="spin" size={18} /> : <Sparkles size={18} />}
              Submit answer
            </button>
          </div>
        </div>
      </div>

      <div className="verdict-bar verdict-bar-fixed">
        <button
          className="primary-button verdict-bar-action"
          data-testid="issue-verdict"
          onClick={onVerdict}
          disabled={isLoading || isEvaluating}
        >
          {isLoading ? <Loader2 className="spin" size={18} /> : <CheckCircle2 size={18} />}
          Generate review note
        </button>
      </div>
    </section>
  )
}
