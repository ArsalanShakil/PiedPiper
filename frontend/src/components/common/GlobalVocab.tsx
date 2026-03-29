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

  // --- Toast ---
  const [toast, setToast] = useState<{ message: string; type: 'info' | 'success' | 'error' } | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function showToast(message: string, type: 'info' | 'success' | 'error' = 'info', duration = 2000) {
    setToast({ message, type })
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => setToast(null), duration)
  }

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

  // --- Translation popup ---
  const [transPopup, setTransPopup] = useState<{
    text: string; translation: string;
    wordByWord: { src: string; dst: string }[];
    pos: { top: number; left: number };
  } | null>(null)
  const transPopupRef = useRef<HTMLDivElement>(null)

  // Close popup on click outside
  useEffect(() => {
    if (!transPopup) return
    function handleClick(e: MouseEvent) {
      if (transPopupRef.current && !transPopupRef.current.contains(e.target as Node)) {
        setTransPopup(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [transPopup])

  const handleTranslate = useCallback(async () => {
    const sel = window.getSelection()
    const text = sel?.toString().trim()
    if (!text || !sel) return

    // Get position for popup
    const range = sel.getRangeAt(0)
    const rect = range.getBoundingClientRect()

    setToolbarVisible(false)
    setBusy(true)
    showToast('Translating...', 'info', 10000)
    try {
      const result = await translate(text)
      setToast(null)
      setTransPopup({
        text,
        translation: result.translation,
        wordByWord: result.word_by_word.map(w => ({
          src: w.src || w.sv || '',
          dst: w.dst || w.en || '',
        })),
        pos: {
          top: rect.bottom + window.scrollY + 8,
          left: Math.max(16, rect.left + window.scrollX - 20),
        },
      })
    } catch {
      showToast('Translation failed', 'error')
    }
    setBusy(false)
  }, [])

  // --- Speak player state ---
  const [speakUrl, setSpeakUrl] = useState<string | null>(null)
  const [speakFile, setSpeakFile] = useState<{ folder: string; name: string } | null>(null)
  const [speakLoading, setSpeakLoading] = useState(false)
  const speakAudioRef = useRef<HTMLAudioElement>(null)
  const speakFileRef = useRef<{ folder: string; name: string } | null>(null)

  // Clean up speak file on unmount
  useEffect(() => {
    return () => {
      if (speakFileRef.current) {
        deleteFile(speakFileRef.current.folder, speakFileRef.current.name).catch(() => {})
      }
    }
  }, [])

  const closeSpeakPlayer = useCallback(() => {
    if (speakAudioRef.current) speakAudioRef.current.pause()
    if (speakFile) deleteFile(speakFile.folder, speakFile.name).catch(() => {})
    setSpeakUrl(null)
    setSpeakFile(null)
    speakFileRef.current = null
  }, [speakFile])

  const handleSpeak = useCallback(async () => {
    const text = window.getSelection()?.toString().trim()
    if (!text) return
    setToolbarVisible(false)
    // Clean up previous
    if (speakFileRef.current) {
      deleteFile(speakFileRef.current.folder, speakFileRef.current.name).catch(() => {})
    }
    setSpeakLoading(true)
    setSpeakUrl(null)
    try {
      const voices = await fetchVoices()
      if (voices.length === 0) { setSpeakLoading(false); return }
      const firstVoice = voices[0]
      if (!firstVoice) { setSpeakLoading(false); return }
      const data = await synthesize({ text, voice_id: firstVoice.id, format: 'wav', save_path: '', filename: '' })
      const url = getPlayUrl(data.folder, data.filename)
      setSpeakUrl(url)
      setSpeakFile({ folder: data.folder, name: data.filename })
      speakFileRef.current = { folder: data.folder, name: data.filename }
      setSpeakLoading(false)
      setTimeout(() => { speakAudioRef.current?.play() }, 100)
    } catch {
      setSpeakLoading(false)
    }
  }, [])

  const handleAddVocab = useCallback(async () => {
    const text = window.getSelection()?.toString().trim()
    if (!text) return
    setToolbarVisible(false)
    setBusy(true)
    showToast('Translating & saving...', 'info', 10000)
    try {
      const result = await translate(text)
      await addWord(text, result.translation)
      showToast('Saved to vocabulary!', 'success')
    } catch {
      showToast('Failed to add to vocabulary', 'error')
    }
    setBusy(false)
  }, [addWord])

  const handleRemoveVocab = useCallback(async () => {
    const text = window.getSelection()?.toString().trim()
    if (!text) return
    setToolbarVisible(false)
    setBusy(true)
    showToast('Removing from vocabulary...', 'info')
    try {
      await removeWord(text)
      showToast('Removed from vocabulary', 'success')
    } catch {
      showToast('Failed to remove', 'error')
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

      {/* Translation popup */}
      {transPopup && (
        <div
          ref={transPopupRef}
          className="global-trans-popup"
          style={{ top: transPopup.pos.top, left: transPopup.pos.left }}
        >
          <div className="global-trans-original">{transPopup.text}</div>
          <div className="global-trans-result">{transPopup.translation}</div>
          {transPopup.wordByWord.length > 1 && (
            <div className="global-trans-words">
              {transPopup.wordByWord.map((w, i) => (
                <span key={i} className="translate-word-pair">
                  <span className="tw-src">{w.src}</span>
                  <span className="tw-dst">{w.dst}</span>
                </span>
              ))}
            </div>
          )}
          <button className="global-trans-close" onClick={() => setTransPopup(null)}>&times;</button>
        </div>
      )}

      {/* Speak Player */}
      {(speakUrl || speakLoading) && (
        <div className="speak-player-bar">
          {speakLoading ? (
            <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>Generating audio...</span>
          ) : (
            <>
              <audio ref={speakAudioRef} src={speakUrl ?? undefined} controls style={{ flex: 1, height: 36 }} />
              <div className="speak-speed-controls">
                {[0.5, 0.75, 1, 1.25, 1.5].map(s => (
                  <button
                    key={s}
                    className="btn btn-small"
                    onClick={() => { if (speakAudioRef.current) speakAudioRef.current.playbackRate = s }}
                    title={`${s}x speed`}
                  >
                    {s}x
                  </button>
                ))}
              </div>
              <button className="btn btn-small btn-danger" onClick={closeSpeakPlayer} title="Close">&times;</button>
            </>
          )}
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`editor-toast editor-toast-${toast.type}`}>
          {toast.message}
        </div>
      )}
    </>
  )
}
