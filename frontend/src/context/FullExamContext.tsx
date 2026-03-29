import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import type { FullExamState, FullExamSection } from '../types/exam'

const STORAGE_KEY = 'yki_full_exam'
const ACTIVE_KEY = 'yki_full_exam_active'

const SECTIONS: FullExamSection[] = [
  { type: 'reading', label: 'Reading', icon: '\uD83D\uDCD6', time: '60 min', status: 'pending', route: '/yki/reading' },
  { type: 'listening', label: 'Listening', icon: '\uD83C\uDFA7', time: '40 min', status: 'pending', route: '/yki/listening' },
  { type: 'writing', label: 'Writing', icon: '\uD83D\uDCDD', time: '54 min', status: 'pending', route: '/yki/writing' },
  { type: 'speaking', label: 'Speaking', icon: '\uD83C\uDFA4', time: '25 min', status: 'pending', route: '/yki/speaking' },
]

interface FullExamContextValue {
  state: FullExamState | null
  isActive: boolean
  activeSection: string | null
  startFullExam: () => void
  completeSection: (score: number) => void
  abortExam: () => void
}

const FullExamContext = createContext<FullExamContextValue | null>(null)

function loadState(): FullExamState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as FullExamState) : null
  } catch {
    return null
  }
}

function loadActive(): string | null {
  return localStorage.getItem(ACTIVE_KEY)
}

export function FullExamProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const [state, setState] = useState<FullExamState | null>(loadState)
  const [activeSection, setActiveSection] = useState<string | null>(loadActive)

  // Sync state to localStorage whenever it changes
  useEffect(() => {
    if (state) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
  }, [state])

  useEffect(() => {
    if (activeSection) {
      localStorage.setItem(ACTIVE_KEY, activeSection)
    } else {
      localStorage.removeItem(ACTIVE_KEY)
    }
  }, [activeSection])

  const isActive = activeSection !== null

  const startFullExam = useCallback(() => {
    const newState: FullExamState = {
      started: new Date().toISOString(),
      currentSection: 0,
      sections: SECTIONS.map(s => ({ ...s })),
      scores: {},
    }
    setState(newState)
    setActiveSection(null)
  }, [])

  const completeSection = useCallback((score: number) => {
    setState(prev => {
      if (!prev) return prev
      const next = { ...prev }
      next.scores = { ...prev.scores }
      next.sections = prev.sections.map(s => ({ ...s }))

      const current = next.sections[next.currentSection]
      if (current) {
        next.scores[current.type] = score
        current.status = 'done'
      }
      next.currentSection = prev.currentSection + 1
      return next
    })
    setActiveSection(null)
    navigate('/yki')
  }, [navigate])

  const abortExam = useCallback(() => {
    setState(null)
    setActiveSection(null)
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(ACTIVE_KEY)
  }, [])

  // Expose a way for dashboard to start the next section
  // The dashboard will read state.currentSection and navigate
  // We need a function to mark the current section as in_progress and set activeSection
  const contextValue: FullExamContextValue = {
    state,
    isActive,
    activeSection,
    startFullExam,
    completeSection,
    abortExam,
  }

  return (
    <FullExamContext.Provider value={contextValue}>
      {children}
    </FullExamContext.Provider>
  )
}

export function useFullExam(): FullExamContextValue {
  const ctx = useContext(FullExamContext)
  if (!ctx) throw new Error('useFullExam must be used within FullExamProvider')
  return ctx
}

/** Start the next section of the full exam (mark in_progress, set active flag, navigate). */
export function useStartNextSection() {
  const navigate = useNavigate()
  const { state } = useFullExam()

  return useCallback(() => {
    if (!state || state.currentSection >= state.sections.length) return
    const section = state.sections[state.currentSection]
    if (!section) return

    // Update state in localStorage directly so the section view can read it immediately
    const updated = { ...state, sections: state.sections.map((s, i) =>
      i === state.currentSection ? { ...s, status: 'in_progress' as const } : { ...s }
    )}
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
    localStorage.setItem(ACTIVE_KEY, section.type)

    navigate(section.route)
  }, [state, navigate])
}
