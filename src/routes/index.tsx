import { createFileRoute } from '@tanstack/react-router'
import {
  AlertTriangle,
  CheckCircle2,
  Clipboard,
  FileText,
  Loader2,
  MessageSquare,
  Mic,
  Radio,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { useMemo, useRef, useState } from 'react'

import type {
  AnalysisResponse,
  ChargeSheet,
  ConceptCheck,
  ConceptStatus,
  EvaluationResponse,
  VerdictResponse,
} from '../lib/types'

export const Route = createFileRoute('/')({
  component: DuckTrialApp,
})

type Screen = 'paste' | 'charge' | 'interrogate' | 'verdict'

type TranscriptLine = {
  speaker: 'duck' | 'developer' | 'system'
  text: string
}

const samplePr = 'https://github.com/facebook/react/pull/31277'

const riskLabels: Record<string, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Urgent',
}

const voiceStateLabels: Record<'idle' | 'connecting' | 'live' | 'fallback', string> = {
  idle: 'Voice ready',
  connecting: 'Connecting voice',
  live: 'Voice live',
  fallback: 'Type instead',
}

const transcriptSpeakerLabels: Record<TranscriptLine['speaker'], string> = {
  duck: 'quack dev',
  developer: 'You',
  system: 'Status',
}

function DuckTrialApp() {
  const [screen, setScreen] = useState<Screen>('paste')
  const [url, setUrl] = useState('')
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null)
  const [concepts, setConcepts] = useState<ConceptCheck[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answer, setAnswer] = useState('')
  const [transcript, setTranscript] = useState<TranscriptLine[]>([])
  const [verdict, setVerdict] = useState<VerdictResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isEvaluating, setIsEvaluating] = useState(false)
  const [error, setError] = useState('')
  const [voiceState, setVoiceState] = useState<'idle' | 'connecting' | 'live' | 'fallback'>(
    'idle',
  )
  const [answerMode, setAnswerMode] = useState<'text' | 'voice'>('text')
  const peerRef = useRef<RTCPeerConnection | null>(null)
  const dataChannelRef = useRef<RTCDataChannel | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null)
  const startVoiceInFlightRef = useRef(false)
  const voiceEpochRef = useRef(0)

  const currentConcept = concepts[currentIndex]
  const board = useMemo(() => groupConcepts(concepts), [concepts])

  async function analyzePr(useDemo = false) {
    setIsLoading(true)
    setError('')
    setVerdict(null)

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, useDemo }),
      })
      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload.error || 'quack dev could not read that pull request.')
      }

      const nextAnalysis = payload as AnalysisResponse
      setAnalysis(nextAnalysis)
      setConcepts(nextAnalysis.chargeSheet.concepts_to_test)
      setCurrentIndex(0)
      setTranscript([
        {
          speaker: 'duck',
          text: `${nextAnalysis.chargeSheet.case_title}. ${nextAnalysis.chargeSheet.charge}`,
        },
        {
          speaker: 'duck',
          text:
            nextAnalysis.chargeSheet.concepts_to_test[0]?.question ||
            'Explain what this PR changes and why it is safe.',
        },
      ])
      setScreen('charge')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'quack dev failed to start.')
    } finally {
      setIsLoading(false)
    }
  }

  function teardownVoiceSession() {
    try {
      dataChannelRef.current?.close()
    } catch {
      /* ignore */
    }
    dataChannelRef.current = null

    try {
      peerRef.current?.close()
    } catch {
      /* ignore */
    }
    peerRef.current = null

    mediaStreamRef.current?.getTracks().forEach((track) => {
      try {
        track.stop()
      } catch {
        /* ignore */
      }
    })
    mediaStreamRef.current = null

    const audio = remoteAudioRef.current
    if (audio) {
      audio.srcObject = null
      audio.pause()
    }
    remoteAudioRef.current = null
  }

  function stopVoice() {
    voiceEpochRef.current += 1
    teardownVoiceSession()
    setVoiceState('idle')
    setAnswerMode('text')
  }

  function selectAnswerMode(mode: 'text' | 'voice') {
    if (mode === 'text') {
      stopVoice()
      return
    }
    setAnswerMode('voice')
    void startVoice()
  }

  async function startVoice() {
    if (!analysis?.chargeSheet) return
    if (startVoiceInFlightRef.current) return
    startVoiceInFlightRef.current = true
    const epoch = voiceEpochRef.current
    teardownVoiceSession()
    try {
      if (epoch !== voiceEpochRef.current) return

      setVoiceState('connecting')
      setError('')

      const sessionResponse = await fetch('/api/realtime-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chargeSheet: analysis.chargeSheet }),
      })
      const session = await sessionResponse.json()

      if (epoch !== voiceEpochRef.current) return

      if (!sessionResponse.ok) {
        throw new Error(session.error || 'Realtime voice is unavailable.')
      }

      const ephemeralKey = session?.client_secret?.value
      if (!ephemeralKey) {
        throw new Error('Realtime session did not return a client secret.')
      }

      const peer = new RTCPeerConnection()
      peerRef.current = peer

      const audioElement = document.createElement('audio')
      audioElement.autoplay = true
      remoteAudioRef.current = audioElement
      peer.ontrack = (event) => {
        audioElement.srcObject = event.streams[0]
      }

      const media = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (epoch !== voiceEpochRef.current) {
        media.getTracks().forEach((track) => track.stop())
        return
      }

      mediaStreamRef.current = media
      media.getTracks().forEach((track) => peer.addTrack(track, media))

      const dataChannel = peer.createDataChannel('oai-events')
      dataChannelRef.current = dataChannel
      dataChannel.addEventListener('message', (event) => {
        handleRealtimeEvent(event.data)
      })
      dataChannel.addEventListener('open', () => {
        setVoiceState('live')
        dataChannel.send(
          JSON.stringify({
            type: 'response.create',
            response: {
            instructions: `Begin the understanding check. Ask this exact first question: ${currentConcept?.question || analysis.chargeSheet.concepts_to_test[0]?.question}`,
            },
          }),
        )
      })

      const offer = await peer.createOffer()
      await peer.setLocalDescription(offer)

      if (epoch !== voiceEpochRef.current) return

      const realtimeModel = session.model || 'gpt-realtime'
      const sdpResponse = await fetch(
        `https://api.openai.com/v1/realtime?model=${encodeURIComponent(realtimeModel)}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${ephemeralKey}`,
            'Content-Type': 'application/sdp',
          },
          body: offer.sdp,
        },
      )

      if (epoch !== voiceEpochRef.current) return

      if (!sdpResponse.ok) {
        throw new Error('The browser could not complete the Realtime voice handshake.')
      }

      await peer.setRemoteDescription({
        type: 'answer',
        sdp: await sdpResponse.text(),
      })
    } catch (caught) {
      teardownVoiceSession()
      setVoiceState('fallback')
      setAnswerMode('text')
      setError(
        caught instanceof Error
          ? `${caught.message} Type your answer below.`
          : 'Voice is unavailable. Type your answer below.',
      )
    } finally {
      startVoiceInFlightRef.current = false
    }
  }

  function handleRealtimeEvent(raw: string) {
    try {
      const event = JSON.parse(raw)
      if (
        event.type === 'response.audio_transcript.done' ||
        event.type === 'response.output_text.done'
      ) {
        const text = event.transcript || event.text
        if (text) {
          appendTranscript('duck', text)
        }
      }
      if (event.type === 'conversation.item.input_audio_transcription.completed') {
        appendTranscript('developer', event.transcript)
      }
    } catch {
      // Realtime sends many event shapes; unsupported events can be ignored for the MVP.
    }
  }

  function appendTranscript(speaker: TranscriptLine['speaker'], text: string) {
    setTranscript((lines) => [...lines, { speaker, text }])
  }

  async function submitAnswer() {
    if (!currentConcept || !answer.trim()) return
    setIsEvaluating(true)
    setError('')

    const answerText = answer.trim()
    setAnswer('')
    appendTranscript('developer', answerText)
    appendTranscript(
      'system',
      'quack dev is checking your answer against the review summary.',
    )

    try {
      const controller = new AbortController()
      const timeout = window.setTimeout(() => controller.abort(), 14000)
      const response = await fetch('/api/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          concept: currentConcept,
          answer: answerText,
          transcript: transcript.map((line) => `${line.speaker}: ${line.text}`),
        }),
        signal: controller.signal,
      })
      window.clearTimeout(timeout)
      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload.error || 'quack dev could not grade that answer.')
      }

      const evaluation = payload as EvaluationResponse
      applyEvaluation(evaluation)
    } catch (caught) {
      const fallback = evaluateAnswerInBrowser(currentConcept, answerText)
      appendTranscript(
        'system',
        caught instanceof DOMException && caught.name === 'AbortError'
          ? 'The model took too long, so quack dev checked the answer locally.'
          : 'The model response failed, so quack dev checked the answer locally.',
      )
      applyEvaluation(fallback)
    } finally {
      setIsEvaluating(false)
    }
  }

  function applyEvaluation(evaluation: EvaluationResponse) {
    setConcepts((items) =>
      items.map((item, index) =>
        index === currentIndex
          ? { ...item, status: evaluation.status, reason: evaluation.reason }
          : item,
      ),
    )
    appendTranscript('duck', evaluation.duck_reply)

    const nextIndex = concepts.findIndex(
      (item, index) => index > currentIndex && item.status === 'unverified',
    )
    if (nextIndex >= 0) {
      setCurrentIndex(nextIndex)
      appendTranscript('duck', concepts[nextIndex].question)
    }
  }

  async function issueVerdict() {
    setIsLoading(true)
    setError('')

    try {
      const response = await fetch('/api/verdict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          concepts,
          title: analysis?.pr.title || 'Untitled pull request',
        }),
      })
      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload.error || 'quack dev could not create a review result.')
      }

      setVerdict(payload as VerdictResponse)
      setScreen('verdict')
      voiceEpochRef.current += 1
      teardownVoiceSession()
      setVoiceState('idle')
      setAnswerMode('text')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Review result failed.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <main className="app-shell">
      <div className="grain" />
      <header className="topbar">
        <div className="brand-lockup">
          <div className="duck-mark" aria-hidden="true">
            qd
          </div>
          <div>
            <p className="eyebrow">quack dev</p>
            <h1>Understand the pull request before you merge.</h1>
          </div>
        </div>
        <div className="status-pill">
          <Radio size={16} />
          Summary → check → review note
        </div>
      </header>

      {error ? (
        <div className="error-banner" role="alert" data-testid="error-banner">
          <AlertTriangle size={18} />
          {error}
        </div>
      ) : null}

      {screen === 'paste' ? (
        <PasteScreen
          url={url}
          setUrl={setUrl}
          isLoading={isLoading}
          onAnalyze={() => analyzePr(false)}
          onDemo={() => analyzePr(true)}
        />
      ) : null}

      {screen === 'charge' && analysis ? (
        <ChargeScreen
          analysis={analysis}
          onBack={() => setScreen('paste')}
          onStart={() => {
            setAnswerMode('text')
            setScreen('interrogate')
          }}
        />
      ) : null}

      {screen === 'interrogate' && analysis ? (
        <InterrogationScreen
          chargeSheet={analysis.chargeSheet}
          concepts={concepts}
          currentConcept={currentConcept}
          currentIndex={currentIndex}
          board={board}
          transcript={transcript}
          answer={answer}
          setAnswer={setAnswer}
          isEvaluating={isEvaluating}
          voiceState={voiceState}
          answerMode={answerMode}
          onSelectAnswerMode={selectAnswerMode}
          onSubmitAnswer={submitAnswer}
          onVerdict={issueVerdict}
          isLoading={isLoading}
        />
      ) : null}

      {screen === 'verdict' && verdict ? (
        <VerdictScreen
          verdict={verdict}
          onRestart={() => {
            voiceEpochRef.current += 1
            teardownVoiceSession()
            setVoiceState('idle')
            setAnswerMode('text')
            setScreen('paste')
            setAnalysis(null)
            setConcepts([])
            setTranscript([])
            setVerdict(null)
            setUrl('')
            setError('')
          }}
        />
      ) : null}
    </main>
  )
}

function PasteScreen({
  url,
  setUrl,
  isLoading,
  onAnalyze,
  onDemo,
}: {
  url: string
  setUrl: (url: string) => void
  isLoading: boolean
  onAnalyze: () => void
  onDemo: () => void
}) {
  return (
    <section className="hero-grid">
      <div className="hero-copy">
        <p className="stamp">PR understanding, not review theater</p>
        <h2>Review the change before you merge.</h2>
        <p>
          quack dev reads a public GitHub PR, explains the risk, then asks the
          few questions that prove you actually understand the change.
        </p>
      </div>

      <form
        className="trial-form"
        onSubmit={(event) => {
          event.preventDefault()
          onAnalyze()
        }}
      >
        <div className="form-heading">
          <h3>Start with a PR link</h3>
          <p>Public GitHub PRs work without OAuth. The demo is tuned for a fast hackathon walkthrough.</p>
        </div>
        <label htmlFor="pr-url">Pull request URL</label>
        <input
          id="pr-url"
          data-testid="pr-url-input"
          type="url"
          placeholder="https://github.com/owner/repo/pull/123"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
        />
        <div className="form-actions">
          <button type="button" className="primary-button demo-button" data-testid="demo-trial" onClick={onDemo} disabled={isLoading}>
            {isLoading ? <Loader2 className="spin" size={18} /> : <Sparkles size={18} />}
            Try 60-sec demo
          </button>
          <button className="ghost-button" data-testid="trial-submit" disabled={isLoading}>
            {isLoading ? <Loader2 className="spin" size={18} /> : <FileText size={18} />}
            Analyze my PR
          </button>
          <button type="button" className="ghost-button" onClick={() => setUrl(samplePr)}>
            Fill sample URL
          </button>
        </div>
      </form>
      <aside className="preview-panel" aria-label="Understanding checklist preview">
        <p className="eyebrow">What judges see fast</p>
        <div className="preview-list">
          <span><strong>1</strong> What changed?</span>
          <span><strong>2</strong> Why it matters</span>
          <span><strong>3</strong> What could break?</span>
          <span><strong>4</strong> What proof is missing?</span>
        </div>
      </aside>
    </section>
  )
}

function ChargeScreen({
  analysis,
  onBack,
  onStart,
}: {
  analysis: AnalysisResponse
  onBack: () => void
  onStart: () => void
}) {
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

function InterrogationScreen({
  chargeSheet,
  concepts,
  currentConcept,
  currentIndex,
  board,
  transcript,
  answer,
  setAnswer,
  isEvaluating,
  voiceState,
  answerMode,
  onSelectAnswerMode,
  onSubmitAnswer,
  onVerdict,
  isLoading,
}: {
  chargeSheet: ChargeSheet
  concepts: ConceptCheck[]
  currentConcept?: ConceptCheck
  currentIndex: number
  board: Record<ConceptStatus, ConceptCheck[]>
  transcript: TranscriptLine[]
  answer: string
  setAnswer: (value: string) => void
  isEvaluating: boolean
  voiceState: 'idle' | 'connecting' | 'live' | 'fallback'
  answerMode: 'text' | 'voice'
  onSelectAnswerMode: (mode: 'text' | 'voice') => void
  onSubmitAnswer: () => void
  onVerdict: () => void
  isLoading: boolean
}) {
  const voiceSessionActive = answerMode === 'voice' && (voiceState === 'connecting' || voiceState === 'live')

  return (
    <section className="interrogation-grid">
      <div className="duck-room">
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
            onClick={() => onSelectAnswerMode('voice')}
          >
            <Mic size={16} strokeWidth={2.25} />
            Voice
          </button>
        </div>

        <div
          className={`duck-avatar-wrap ${voiceSessionActive ? 'duck-voice-active' : ''}`}
          aria-hidden="true"
        >
          {answerMode === 'voice' ? (
            <img
              className="duck-mascot"
              src="/duck.svg"
              width={88}
              height={88}
              alt=""
            />
          ) : (
            <div className="duck-avatar">
              <div className="duck-head" />
              <div className="duck-beak" />
              <div className="duck-eye" />
            </div>
          )}
        </div>
        <div className="question-block" data-testid="current-question">
          <p className="eyebrow">Question {Math.min(currentIndex + 1, concepts.length)} of {concepts.length}</p>
          <h2>{currentConcept?.question || 'Question ready.'}</h2>
          <p>
            {currentConcept?.follow_up_if_weak ||
              'Explain the mechanism, safeguard, or test coverage.'}
          </p>
        </div>

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

        {answerMode === 'voice' ? (
          <div className="voice-status-row">
            <span className={`voice-dot ${voiceState}`}>
              {voiceState === 'connecting' ? (
                <Loader2 className="spin voice-dot-spinner" size={14} aria-hidden />
              ) : null}
              {voiceStateLabels[voiceState]}
            </span>
            <button type="button" className="ghost-link" onClick={() => onSelectAnswerMode('text')}>
              Back to typing (ends voice)
            </button>
          </div>
        ) : (
          <p className="voice-hint">Tap Voice to speak with realtime quack dev — microphone access required.</p>
        )}
      </div>

      <div className="transcript-panel">
        <p className="eyebrow">Live notes</p>
        <div className="transcript-log" data-testid="transcript-log">
          {transcript.map((line, index) => (
            <p key={`${line.speaker}-${index}`} className={`line-${line.speaker}`}>
              <strong>{transcriptSpeakerLabels[line.speaker]}</strong>
              {line.text}
            </p>
          ))}
        </div>
      </div>

      <aside className="evidence-panel">
        <p className="eyebrow">Diff details</p>
        <h3>{chargeSheet.charge}</h3>
        <ul className="evidence-list compact">
          {chargeSheet.evidence.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </aside>

      <UnderstandingBoard board={board} />

      <div className="verdict-bar">
        <button
          className="primary-button"
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

function UnderstandingBoard({ board }: { board: Record<ConceptStatus, ConceptCheck[]> }) {
  const understood = board.passed.length
  const needsWork = board.failed.length + board.weak.length
  const total = understood + needsWork + board.unverified.length
  const progress = total ? Math.round((understood / total) * 100) : 0

  return (
    <aside className="board-panel" data-testid="understanding-board">
      <p className="eyebrow">Concepts</p>
      <div className="progress-card">
        <strong>{understood}/{total} clear</strong>
        <div className="progress-track">
          <span style={{ width: `${progress}%` }} />
        </div>
        <small>{needsWork ? `${needsWork} needs more detail` : 'Answer each concept to unlock a clean review note.'}</small>
      </div>
      <BoardGroup label="Clear" items={board.passed} status="passed" />
      <BoardGroup label="Needs more detail" items={[...board.failed, ...board.weak]} status="failed" />
      <BoardGroup label="Not answered yet" items={board.unverified} status="unverified" />
    </aside>
  )
}

function BoardGroup({
  label,
  items,
  status,
}: {
  label: string
  items: ConceptCheck[]
  status: ConceptStatus
}) {
  return (
    <div className="board-group">
      <h4>{label}</h4>
      {items.length ? (
        items.map((item) => (
          <div className={`board-item status-${status}`} key={item.id}>
            <span>{item.concept}</span>
            {item.reason ? <small>{item.reason}</small> : null}
          </div>
        ))
      ) : (
        <p className="empty-state">None yet.</p>
      )}
    </div>
  )
}

function VerdictScreen({
  verdict,
  onRestart,
}: {
  verdict: VerdictResponse
  onRestart: () => void
}) {
  const [copied, setCopied] = useState(false)

  async function copyComment() {
    await navigator.clipboard.writeText(verdict.pr_comment)
    setCopied(true)
  }

  return (
    <section className="verdict-screen" data-testid="verdict-screen">
      <div className={`verdict-card verdict-${verdict.verdict}`}>
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

function groupConcepts(concepts: ConceptCheck[]): Record<ConceptStatus, ConceptCheck[]> {
  return concepts.reduce(
    (groups, concept) => {
      groups[concept.status].push(concept)
      return groups
    },
    {
      passed: [],
      weak: [],
      failed: [],
      unverified: [],
    } as Record<ConceptStatus, ConceptCheck[]>,
  )
}

function evaluateAnswerInBrowser(
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
