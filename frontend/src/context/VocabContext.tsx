import { createContext, useContext, useCallback, useRef, useEffect, useState, type ReactNode } from 'react'
import { fetchVocabulary, addVocab, deleteVocab } from '../api/vocabulary'
import type { VocabItem } from '../types/api'

interface VocabMap {
  [key: string]: string
}

interface VocabContextValue {
  vocabMap: VocabMap
  getTranslation: (word: string) => string | undefined
  isInVocab: (text: string) => boolean
  reloadVocab: () => void
  addWord: (swedish: string, translation: string, context?: string) => Promise<void>
  removeWord: (text: string) => Promise<void>
  version: number // increments on changes, triggers re-highlights
}

const VocabContext = createContext<VocabContextValue | null>(null)

export function useVocab() {
  const ctx = useContext(VocabContext)
  if (!ctx) throw new Error('useVocab must be used within VocabProvider')
  return ctx
}

export function VocabProvider({ children }: { children: ReactNode }) {
  const vocabMapRef = useRef<VocabMap>({})
  const allItemsRef = useRef<VocabItem[]>([])
  const [version, setVersion] = useState(0)

  const load = useCallback(async () => {
    try {
      const items = await fetchVocabulary()
      allItemsRef.current = items
      const map: VocabMap = {}
      for (const v of items) {
        const key = v.swedish_text.toLowerCase().replace(/[.,!?;:]/g, '').trim()
        if (key) map[key] = v.translation
      }
      vocabMapRef.current = map
      setVersion(v => v + 1)
    } catch {
      // silently fail
    }
  }, [])

  useEffect(() => { load() }, [load])

  const getTranslation = useCallback((word: string): string | undefined => {
    return vocabMapRef.current[word.toLowerCase().replace(/[.,!?;:]/g, '').trim()]
  }, [])

  const isInVocab = useCallback((text: string): boolean => {
    const clean = text.toLowerCase().replace(/[.,!?;:]/g, '').trim()
    return clean in vocabMapRef.current
  }, [])

  const reloadVocab = useCallback(() => { load() }, [load])

  const addWord = useCallback(async (swedish: string, translation: string, context?: string) => {
    await addVocab({ swedish_text: swedish, translation, context })
    await load()
  }, [load])

  const removeWord = useCallback(async (text: string) => {
    const clean = text.toLowerCase().replace(/[.,!?;:]/g, '').trim()
    const match = allItemsRef.current.find(
      v => v.swedish_text.toLowerCase().replace(/[.,!?;:]/g, '').trim() === clean
    )
    if (match) {
      await deleteVocab(match.id)
      await load()
    }
  }, [load])

  return (
    <VocabContext.Provider value={{
      vocabMap: vocabMapRef.current,
      getTranslation,
      isInVocab,
      reloadVocab,
      addWord,
      removeWord,
      version,
    }}>
      {children}
    </VocabContext.Provider>
  )
}
