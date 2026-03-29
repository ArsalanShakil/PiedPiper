import { useState, useRef, useCallback } from 'react'

/* ---------- browser typing shim ---------- */
interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList
}

interface SpeechRecognitionInstance extends EventTarget {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((ev: SpeechRecognitionEvent) => void) | null
  onerror: ((ev: Event) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}

type SpeechRecognitionCtor = new () => SpeechRecognitionInstance

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  const w = window as unknown as Record<string, unknown>
  return (w['SpeechRecognition'] ?? w['webkitSpeechRecognition'] ?? null) as SpeechRecognitionCtor | null
}

/* ---------- hook ---------- */

/**
 * Hook wrapping the Web Speech API for live transcription.
 * Falls back gracefully when the API is unavailable.
 */
export function useSpeechRecognition(lang: string) {
  const [transcript, setTranscript] = useState('')
  const [interimTranscript, setInterimTranscript] = useState('')
  const [isListening, setIsListening] = useState(false)
  const recogRef = useRef<SpeechRecognitionInstance | null>(null)
  /** Flag to keep auto-restarting while we want recognition active */
  const keepAliveRef = useRef(false)

  const start = useCallback(() => {
    const Ctor = getSpeechRecognition()
    if (!Ctor) return // browser doesn't support it

    // Tear down any previous instance
    if (recogRef.current) {
      try { recogRef.current.abort() } catch { /* ignore */ }
    }

    const recog = new Ctor()
    recog.lang = lang
    recog.continuous = true
    recog.interimResults = true

    recog.onresult = (event: SpeechRecognitionEvent) => {
      let finalText = ''
      let interimText = ''
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i]
        if (!result) continue
        const alt = result[0]
        if (!alt) continue
        if (result.isFinal) {
          finalText += alt.transcript + ' '
        } else {
          interimText += alt.transcript
        }
      }
      if (finalText) setTranscript(prev => prev + finalText)
      setInterimTranscript(interimText)
    }

    recog.onerror = () => { /* swallow errors */ }

    recog.onend = () => {
      // Auto-restart if we still want to listen
      if (keepAliveRef.current) {
        try { recog.start() } catch { /* ignore */ }
      } else {
        setIsListening(false)
      }
    }

    recogRef.current = recog
    keepAliveRef.current = true
    setIsListening(true)
    try { recog.start() } catch { /* ignore */ }
  }, [lang])

  const stop = useCallback(() => {
    keepAliveRef.current = false
    if (recogRef.current) {
      try { recogRef.current.stop() } catch { /* ignore */ }
      recogRef.current = null
    }
    setIsListening(false)
    setInterimTranscript('')
  }, [])

  const reset = useCallback(() => {
    stop()
    setTranscript('')
    setInterimTranscript('')
  }, [stop])

  return { transcript, interimTranscript, isListening, start, stop, reset }
}
