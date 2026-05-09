import { useEffect, useRef, useState } from 'react'

import type { ChargeSheet, ConceptCheck } from '../lib/types'

export type TranscriptLine = {
  speaker: 'duck' | 'developer' | 'system'
  text: string
}

export type VoiceState = 'idle' | 'connecting' | 'live' | 'fallback'
export type AnswerMode = 'text' | 'voice'

export type UseVoiceSessionOptions = {
  screen: string
  chargeSheet: ChargeSheet | null
  currentConcept: ConceptCheck | undefined
  appendTranscript: (speaker: TranscriptLine['speaker'], text: string) => void
}

export type UseVoiceSessionReturn = {
  voiceState: VoiceState
  answerMode: AnswerMode
  voiceInputDraft: string
  selectAnswerMode: (mode: AnswerMode) => void
}

export function useVoiceSession({
  screen,
  chargeSheet,
  currentConcept,
  appendTranscript,
}: UseVoiceSessionOptions): UseVoiceSessionReturn {
  const [voiceState, setVoiceState] = useState<VoiceState>('idle')
  const [answerMode, setAnswerMode] = useState<AnswerMode>('text')
  const [voiceInputDraft, setVoiceInputDraft] = useState('')

  const peerRef = useRef<RTCPeerConnection | null>(null)
  const dataChannelRef = useRef<RTCDataChannel | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null)
  const startVoiceInFlightRef = useRef(false)
  const voiceEpochRef = useRef(0)

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
    setVoiceInputDraft('')
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
      if (event.type === 'conversation.item.input_audio_transcription.delta') {
        const delta = event.delta || event.text || ''
        if (delta) {
          setVoiceInputDraft((draft) => `${draft}${delta}`)
        }
      }
      if (event.type === 'conversation.item.input_audio_transcription.completed') {
        const text = event.transcript || event.text
        if (text) {
          appendTranscript('developer', text)
          setVoiceInputDraft('')
        }
      }
      if (
        event.type === 'conversation.item.input_audio_transcription.failed' ||
        event.type === 'input_audio_buffer.speech_started'
      ) {
        if (event.type === 'input_audio_buffer.speech_started') {
          setVoiceInputDraft('')
          return
        }
        appendTranscript(
          'system',
          'Voice input was heard, but transcription failed. Try typing the answer.',
        )
      }
    } catch {
      // Realtime sends many event shapes; unsupported events can be ignored for the MVP.
    }
  }

  async function startVoice() {
    if (!chargeSheet) return
    if (startVoiceInFlightRef.current) return
    startVoiceInFlightRef.current = true
    const epoch = voiceEpochRef.current
    teardownVoiceSession()
    try {
      if (epoch !== voiceEpochRef.current) return

      setVoiceState('connecting')

      const sessionResponse = await fetch('/api/realtime-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chargeSheet }),
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
              instructions: `Begin the understanding check. Ask this exact first question: ${currentConcept?.question || chargeSheet.concepts_to_test[0]?.question}`,
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
      appendTranscript(
        'system',
        caught instanceof Error
          ? `${caught.message} Type your answer below.`
          : 'Voice is unavailable. Type your answer below.',
      )
    } finally {
      startVoiceInFlightRef.current = false
    }
  }

  function selectAnswerMode(mode: AnswerMode) {
    if (mode === 'text') {
      stopVoice()
      return
    }
    if (answerMode === 'voice' && (voiceState === 'connecting' || voiceState === 'live')) {
      return
    }
    setAnswerMode('voice')
    void startVoice()
  }

  useEffect(() => {
    if (screen === 'interrogate') return
    voiceEpochRef.current += 1
    teardownVoiceSession()
    startVoiceInFlightRef.current = false
    setVoiceState('idle')
    setAnswerMode('text')
  }, [screen])

  return {
    voiceState,
    answerMode,
    voiceInputDraft,
    selectAnswerMode,
  }
}
