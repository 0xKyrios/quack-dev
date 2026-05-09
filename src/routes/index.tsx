import { createFileRoute } from '@tanstack/react-router'
import { AlertTriangle, Radio } from 'lucide-react'
import { useMemo, useState } from 'react'

import { ChargeScreen } from '../components/ChargeScreen'
import { InterrogationScreen } from '../components/InterrogationScreen'
import type { TranscriptLine } from '../components/InterrogationScreen'
import { PasteScreen } from '../components/PasteScreen'
import { VerdictScreen } from '../components/VerdictScreen'
import { evaluateAnswerInBrowser } from '../lib/evaluateLocal'
import { groupConcepts } from '../lib/groupConcepts'
import type {
  AnalysisResponse,
  ConceptCheck,
  EvaluationResponse,
  VerdictResponse,
} from '../lib/types'
import { useVoiceSession } from '../hooks/useVoiceSession'

export const Route = createFileRoute('/')({
  component: DuckTrialApp,
})

type Screen = 'paste' | 'charge' | 'interrogate' | 'verdict'

const checkingStatusText = 'quack dev is checking your answer against the review summary.'

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

  const currentConcept = concepts[currentIndex]
  const board = useMemo(() => groupConcepts(concepts), [concepts])

  function appendTranscript(speaker: TranscriptLine['speaker'], text: string) {
    setTranscript((lines) => [...lines, { speaker, text }])
  }

  const { voiceState, answerMode, voiceInputDraft, selectAnswerMode } = useVoiceSession({
    screen,
    chargeSheet: analysis?.chargeSheet ?? null,
    currentConcept,
    appendTranscript,
  })

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
          speaker: 'system',
          text: `${nextAnalysis.chargeSheet.case_title}. ${nextAnalysis.chargeSheet.charge}`,
        },
      ])
      setScreen('charge')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'quack dev failed to start.')
    } finally {
      setIsLoading(false)
    }
  }

  async function submitAnswer() {
    if (!currentConcept || !answer.trim()) return
    setIsEvaluating(true)
    setError('')

    const answerText = answer.trim()
    setAnswer('')
    appendTranscript('developer', answerText)
    appendTranscript('system', checkingStatusText)

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
      removeCheckingStatus()
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
    removeCheckingStatus()
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
    }
  }

  function removeCheckingStatus() {
    setTranscript((lines) =>
      lines.filter((line) => line.speaker !== 'system' || line.text !== checkingStatusText),
    )
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
      selectAnswerMode('text')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Review result failed.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <main className="app-shell">
      <a href="#hero-grid" className="skip-link">Skip to main content</a>
      <div className="grain" />
      <header className="topbar">
        <div className="brand-lockup">
          <div className="duck-mark" aria-hidden="true">
            qd
          </div>
          <div>
            <p className="eyebrow">quack dev</p>
            <p className="tagline">The rubber duck that reviews you back.</p>
          </div>
        </div>
        <div className="status-pill">
          <Radio size={16} />
          Read → explain → ship
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
            selectAnswerMode('text')
            setScreen('interrogate')
          }}
        />
      ) : null}

      {screen === 'interrogate' && analysis ? (
        <InterrogationScreen
          chargeSheet={analysis.chargeSheet}
          sources={analysis.sources}
          connectorsUsed={analysis.connectorsUsed}
          concepts={concepts}
          currentConcept={currentConcept}
          currentIndex={currentIndex}
          board={board}
          transcript={transcript}
          answer={answer}
          voiceInputDraft={voiceInputDraft}
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
            selectAnswerMode('text')
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
