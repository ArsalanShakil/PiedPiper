import { useEffect, useRef, useState, useCallback } from 'react'
import { useVocab } from '../../context/VocabContext'
import { translate } from '../../api/editor'
import { fetchVoices, synthesize, deleteFile, getPlayUrl } from '../../api/tts'

/**
 * Global component that:
 * 1. Highlights all vocab words across the entire app using CSS Custom Highlight API
 * 2. Shows a floating selection toolbar (Translate / Speak / +Vocab / -Vocab) on any text selection
 */
export default function GlobalVocab() {
  const { vocabMap, isInVocab, addWord, removeWord, version } = useVocab()

  // --- Global Highlighting ---
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const applyHighlights = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cssHighlights = (CSS as any).highlights as Map<string, unknown> | undefined
    if (!cssHighlights) return

    const keys = Object.keys(vocabMap)
    if (keys.length === 0) {
      cssHighlights.delete('vocab-words')
      return
    }

    const escaped = keys.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    const pattern = new RegExp(
      '(?:^|[\\s.,;:!?()\\[\\]"\'—–-])(' + escaped.join('|') + ')(?=[\\s.,;:!?()\\[\\]"\'—–-]|$)',
      'gi',
    )

    // Walk text nodes inside .main-content (excludes sidebar)
    const container = document.querySelector('.main-content')
    if (!container) return

    const ranges: Range[] = []
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
    let node = walker.nextNode()
    while (node) {
      // Skip text inside inputs, textareas, and the translate widget
      const parent = node.parentElement
      if (parent && (
        parent.tagName === 'INPUT' ||
        parent.tagName === 'TEXTAREA' ||
        parent.tagName === 'SELECT' ||
        parent.closest('.translate-widget') ||
        parent.closest('.selection-toolbar') ||
        parent.closest('.vocab-tooltip') ||
        parent.closest('.translate-fab')
      )) {
        node = walker.nextNode()
        continue
      }

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
            // range may be out of bounds
          }
        }
        m = pattern.exec(text)
      }
      node = walker.nextNode()
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const HL = (globalThis as any).Highlight
    if (!HL || ranges.length === 0) {
      cssHighlights.delete('vocab-words')
      return
    }
    cssHighlights.set('vocab-words', new HL(...ranges))
  }, [vocabMap])

  // Re-apply highlights when vocab changes or DOM mutates
  useEffect(() => {
    const scheduleHighlight = () => {
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current)
      highlightTimerRef.current = setTimeout(applyHighlights, 200)
    }

    scheduleHighlight()

    // Watch for DOM changes in .main-content
    const container = document.querySelector('.main-content')
    if (!container) return

    const observer = new MutationObserver(scheduleHighlight)
    observer.observe(container, { childList: true, subtree: true, characterData: true })

    return () => {
      observer.disconnect()
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current)
    }
  }, [applyHighlights, version])

  // --- Global Selection Toolbar ---
  const [toolbarVisible, setToolbarVisible] = useState(false)
  const [toolbarPos, setToolbarPos] = useState({ top: 0, left: 0 })
  const [selectedInVocab, setSelectedInVocab] = useState(false)
  const [busy, setBusy] = useState(false)
  const toolbarRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleSelection() {
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed) {
        // Don't hide if toolbar itself is focused
        return
      }
      const text = sel.toString().trim()
      if (!text || text.length < 2) {
        setToolbarVisible(false)
        return
      }

      // Don't show toolbar if selection is inside the translate widget, toolbar itself, or inputs
      const anchor = sel.anchorNode?.parentElement
      if (anchor && (
        anchor.closest('.translate-widget') ||
        anchor.closest('.global-sel-toolbar') ||
        anchor.closest('.selection-toolbar') ||
        anchor.tagName === 'INPUT' ||
        anchor.tagName === 'TEXTAREA'
      )) {
        return
      }

      // Don't show on editor (editor has its own toolbar)
      if (anchor && anchor.closest('.ql-editor')) {
        setToolbarVisible(false)
        return
      }

      const range = sel.getRangeAt(0)
      const rect = range.getBoundingClientRect()
      setToolbarPos({
        top: rect.top + window.scrollY - 44,
        left: rect.left + window.scrollX + rect.width / 2 - 100,
      })
      setSelectedInVocab(isInVocab(text))
      setToolbarVisible(true)
    }

    function handleMouseDown(e: MouseEvent) {
      const toolbar = toolbarRef.current
      if (toolbar && !toolbar.contains(e.target as Node)) {
        setToolbarVisible(false)
      }
    }

    document.addEventListener('mouseup', handleSelection)
    document.addEventListener('mousedown', handleMouseDown)
    return () => {
      document.removeEventListener('mouseup', handleSelection)
      document.removeEventListener('mousedown', handleMouseDown)
    }
  }, [isInVocab])

  const handleTranslate = useCallback(async () => {
    const text = window.getSelection()?.toString().trim()
    if (!text) return
    setToolbarVisible(false)
    setBusy(true)
    try {
      const result = await translate(text)
      // Show result in an alert for now (the floating translate widget is available for full UX)
      const wbw = result.word_by_word.length > 1
        ? '\n\n' + result.word_by_word.map(w => `${w.src || w.sv || ''} → ${w.dst || w.en || ''}`).join('\n')
        : ''
      alert(`${text}\n→ ${result.translation}${wbw}`)
    } catch {
      alert('Translation failed')
    }
    setBusy(false)
  }, [])

  const handleSpeak = useCallback(async () => {
    const text = window.getSelection()?.toString().trim()
    if (!text) return
    setToolbarVisible(false)
    try {
      const voices = await fetchVoices()
      if (voices.length === 0) return
      const firstVoice = voices[0]
      if (!firstVoice) return
      const data = await synthesize({ text, voice_id: firstVoice.id, format: 'wav', save_path: '', filename: '' })
      const audio = new Audio(getPlayUrl(data.folder, data.filename))
      audio.addEventListener('ended', () => { deleteFile(data.folder, data.filename).catch(() => {}) })
      audio.play()
    } catch {
      // TTS not available
    }
  }, [])

  const handleAddVocab = useCallback(async () => {
    const text = window.getSelection()?.toString().trim()
    if (!text) return
    setToolbarVisible(false)
    setBusy(true)
    try {
      const result = await translate(text)
      await addWord(text, result.translation)
    } catch {
      alert('Failed to add to vocabulary')
    }
    setBusy(false)
  }, [addWord])

  const handleRemoveVocab = useCallback(async () => {
    const text = window.getSelection()?.toString().trim()
    if (!text) return
    setToolbarVisible(false)
    setBusy(true)
    try {
      await removeWord(text)
    } catch {
      alert('Failed to remove from vocabulary')
    }
    setBusy(false)
  }, [removeWord])

  return (
    <>
      {toolbarVisible && (
        <div
          ref={toolbarRef}
          className="global-sel-toolbar selection-toolbar visible"
          style={{
            top: toolbarPos.top,
            left: toolbarPos.left,
            position: 'absolute',
            zIndex: 300,
          }}
        >
          <button className="sel-btn sel-primary" onClick={handleTranslate} disabled={busy}>Translate</button>
          <button className="sel-btn" onClick={handleSpeak} disabled={busy}>Speak</button>
          {selectedInVocab ? (
            <button className="sel-btn sel-danger" onClick={handleRemoveVocab} disabled={busy}>- Vocab</button>
          ) : (
            <button className="sel-btn" onClick={handleAddVocab} disabled={busy}>+ Vocab</button>
          )}
        </div>
      )}
    </>
  )
}
