import { useState, useCallback } from 'react'

export type ExamPhase = 'menu' | 'loading' | 'exam' | 'results'

export function useExamFlow<TData>() {
  const [phase, setPhase] = useState<ExamPhase>('menu')
  const [examData, setExamDataState] = useState<TData | null>(null)
  const [isMock, setIsMock] = useState(false)
  const [score, setScore] = useState<number | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [loadingMessage, setLoadingMessage] = useState('Generating...')

  const startLoading = useCallback((mock: boolean, message?: string) => {
    setIsMock(mock)
    setPhase('loading')
    setLoadingMessage(message || 'Generating...')
  }, [])

  const setExamData = useCallback((data: TData) => {
    setExamDataState(data)
    setPhase('exam')
  }, [])

  const setResults = useCallback((s: number, f: string) => {
    setScore(s)
    setFeedback(f)
    setPhase('results')
  }, [])

  const backToMenu = useCallback(() => {
    setPhase('menu')
    setExamDataState(null)
    setScore(null)
    setFeedback(null)
  }, [])

  const startEvaluating = useCallback(() => {
    setPhase('loading')
    setLoadingMessage('Evaluating...')
  }, [])

  return {
    phase,
    examData,
    isMock,
    score,
    feedback,
    loadingMessage,
    startLoading,
    setExamData,
    setResults,
    backToMenu,
    startEvaluating,
  }
}
