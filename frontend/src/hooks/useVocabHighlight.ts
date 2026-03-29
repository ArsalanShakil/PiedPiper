import { useCallback, useRef } from 'react'
import { fetchVocabulary } from '../api/vocabulary'

/* CSS Custom Highlight API — use any-cast since TS DOM types may conflict */

interface VocabMap {
  [key: string]: string
}

export function useVocabHighlight(editorRef: React.RefObject<HTMLDivElement | null>) {
  const vocabMapRef = useRef<VocabMap>({})
  const patternRef = useRef<RegExp | null>(null)
  const loadedRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const loadVocab = useCallback(async () => {
    if (loadedRef.current) return
    try {
      const items = await fetchVocabulary()
      const map: VocabMap = {}
      for (const v of items) {
        const key = v.swedish_text.toLowerCase().replace(/[.,!?;:]/g, '').trim()
        if (key) map[key] = v.translation
      }
      vocabMapRef.current = map

      const keys = Object.keys(map)
      if (keys.length > 0) {
        const escaped = keys.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        patternRef.current = new RegExp(
          '(?:^|[\\s.,;:!?()\\[\\]"\'—–-])(' + escaped.join('|') + ')(?=[\\s.,;:!?()\\[\\]"\'—–-]|$)',
          'gi',
        )
      } else {
        patternRef.current = null
      }
      loadedRef.current = true
    } catch {
      // vocab fetch failed — silently skip highlighting
    }
  }, [])

  const applyHighlights = useCallback(() => {
    const cssHighlights = (CSS as unknown as { highlights?: Map<string, unknown> }).highlights
    if (!cssHighlights) return
    const pattern = patternRef.current
    if (!pattern || Object.keys(vocabMapRef.current).length === 0) {
      cssHighlights.delete('vocab-words')
      return
    }

    const container = editorRef.current
    if (!container) return
    const editor = container.querySelector('.ql-editor')
    if (!editor) return

    const ranges: Range[] = []
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT)
    let node = walker.nextNode()
    while (node) {
      const text = node.textContent ?? ''
      pattern.lastIndex = 0
      let m = pattern.exec(text)
      while (m) {
        const match1 = m[1]
        if (match1) {
          const wordStart = m.index + m[0].indexOf(match1)
          try {
            const range = new Range()
            range.setStart(node, wordStart)
            range.setEnd(node, wordStart + match1.length)
            ranges.push(range)
          } catch {
            // range may be invalid if text changed concurrently
          }
        }
        m = pattern.exec(text)
      }
      node = walker.nextNode()
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const HL = (globalThis as any).Highlight
    if (!HL) return
    const highlight = new HL(...ranges)
    cssHighlights.set('vocab-words', highlight)
  }, [editorRef])

  const refreshHighlights = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      loadVocab().then(() => applyHighlights())
    }, 150)
  }, [loadVocab, applyHighlights])

  const getTranslation = useCallback((word: string): string | undefined => {
    return vocabMapRef.current[word.toLowerCase()]
  }, [])

  const reloadVocab = useCallback(() => {
    loadedRef.current = false
    loadVocab().then(() => applyHighlights())
  }, [loadVocab, applyHighlights])

  return { refreshHighlights, getTranslation, reloadVocab, vocabMapRef }
}
