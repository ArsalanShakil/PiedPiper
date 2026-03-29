import { useState, useRef, useCallback, useEffect } from 'react'
import { translate } from '../../api/editor'

type Direction = 'sv-en' | 'en-sv'

export default function TranslateWidget() {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [output, setOutput] = useState('')
  const [wordByWord, setWordByWord] = useState<{ src: string; dst: string }[]>([])
  const [direction, setDirection] = useState<Direction>('sv-en')
  const [loading, setLoading] = useState(false)

  // FAB position (draggable)
  const [fabPos, setFabPos] = useState({ x: window.innerWidth - 72, y: window.innerHeight - 72 })
  const fabDragRef = useRef<{ dragging: boolean; startX: number; startY: number; origX: number; origY: number; moved: boolean }>({
    dragging: false, startX: 0, startY: 0, origX: 0, origY: 0, moved: false,
  })

  // Widget position (draggable)
  const [widgetPos, setWidgetPos] = useState({ x: 0, y: 0 })
  const widgetDragRef = useRef<{ dragging: boolean; startX: number; startY: number; origX: number; origY: number }>({
    dragging: false, startX: 0, startY: 0, origX: 0, origY: 0,
  })
  const widgetRef = useRef<HTMLDivElement>(null)

  // FAB drag handlers
  const handleFabMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    fabDragRef.current = { dragging: true, startX: e.clientX, startY: e.clientY, origX: fabPos.x, origY: fabPos.y, moved: false }
  }, [fabPos])

  // Widget drag handlers
  const handleWidgetMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('input, textarea, button, select, .translate-body')) return
    e.preventDefault()
    widgetDragRef.current = { dragging: true, startX: e.clientX, startY: e.clientY, origX: widgetPos.x, origY: widgetPos.y }
  }, [widgetPos])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      // FAB drag
      const fd = fabDragRef.current
      if (fd.dragging) {
        const dx = e.clientX - fd.startX
        const dy = e.clientY - fd.startY
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) fd.moved = true
        setFabPos({
          x: Math.max(0, Math.min(window.innerWidth - 48, fd.origX + dx)),
          y: Math.max(0, Math.min(window.innerHeight - 48, fd.origY + dy)),
        })
      }
      // Widget drag
      const wd = widgetDragRef.current
      if (wd.dragging) {
        setWidgetPos({
          x: Math.max(0, Math.min(window.innerWidth - 380, wd.origX + (e.clientX - wd.startX))),
          y: Math.max(0, Math.min(window.innerHeight - 100, wd.origY + (e.clientY - wd.startY))),
        })
      }
    }
    const handleMouseUp = () => {
      // If FAB wasn't dragged (just clicked), open the widget
      const fd = fabDragRef.current
      if (fd.dragging && !fd.moved) {
        // Position widget near the FAB
        setWidgetPos({
          x: Math.max(0, Math.min(window.innerWidth - 380, fabPos.x - 320)),
          y: Math.max(0, Math.min(window.innerHeight - 400, fabPos.y - 200)),
        })
        setOpen(true)
      }
      fabDragRef.current.dragging = false
      widgetDragRef.current.dragging = false
    }
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [fabPos])

  const handleTranslate = async () => {
    const text = input.trim()
    if (!text) return
    setLoading(true)
    setOutput('')
    setWordByWord([])
    try {
      const [source, target] = direction === 'sv-en' ? ['sv', 'en'] : ['en', 'sv']
      const result = await translate(text, undefined, source, target)
      setOutput(result.translation)
      setWordByWord(
        result.word_by_word.map(w => ({
          src: w.src || w.sv || '',
          dst: w.dst || w.en || '',
        }))
      )
    } catch {
      setOutput('Translation failed')
    }
    setLoading(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleTranslate()
    }
  }

  const swapDirection = () => {
    setDirection(d => d === 'sv-en' ? 'en-sv' : 'sv-en')
    if (output) {
      setInput(output)
      setOutput(input)
      setWordByWord([])
    }
  }

  const sourceLang = direction === 'sv-en' ? 'Svenska' : 'English'
  const targetLang = direction === 'sv-en' ? 'English' : 'Svenska'

  return (
    <>
      {/* Draggable FAB — always visible */}
      <button
        className="translate-fab"
        style={{ left: fabPos.x, top: fabPos.y, right: 'auto', bottom: 'auto' }}
        onMouseDown={handleFabMouseDown}
        title="Translate"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 8l6 6" /><path d="M4 14l6-6 2-3" /><path d="M2 5h12" /><path d="M7 2h1" />
          <path d="M22 22l-5-10-5 10" /><path d="M14 18h6" />
        </svg>
      </button>

      {/* Widget panel */}
      {open && (
        <div
          ref={widgetRef}
          className="translate-widget"
          style={{ left: widgetPos.x, top: widgetPos.y }}
          onMouseDown={handleWidgetMouseDown}
        >
          <div className="translate-header">
            <span className="translate-grip">{'\u2630'}</span>
            <span className="translate-title">Translate</span>
            <button className="translate-close" onClick={() => setOpen(false)}>&times;</button>
          </div>

          <div className="translate-body">
            <div className="translate-direction">
              <span className="translate-lang">{sourceLang}</span>
              <button className="translate-swap" onClick={swapDirection} title="Swap languages">
                {'\u21C4'}
              </button>
              <span className="translate-lang">{targetLang}</span>
            </div>

            <textarea
              className="translate-input"
              placeholder={`Type ${sourceLang} text...`}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={3}
            />

            <button
              className="btn btn-primary translate-btn"
              onClick={handleTranslate}
              disabled={loading || !input.trim()}
            >
              {loading ? 'Translating...' : 'Translate'}
            </button>

            {output && (
              <div className="translate-output">
                <div className="translate-result">{output}</div>
                {wordByWord.length > 1 && (
                  <div className="translate-words">
                    {wordByWord.map((w, i) => (
                      <span key={i} className="translate-word-pair">
                        <span className="tw-src">{w.src}</span>
                        <span className="tw-dst">{w.dst}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
