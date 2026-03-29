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

  // Dragging state
  const [pos, setPos] = useState({ x: window.innerWidth - 420, y: 80 })
  const dragRef = useRef<{ dragging: boolean; startX: number; startY: number; origX: number; origY: number }>({
    dragging: false, startX: 0, startY: 0, origX: 0, origY: 0,
  })
  const widgetRef = useRef<HTMLDivElement>(null)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('input, textarea, button, select, .translate-body')) return
    e.preventDefault()
    dragRef.current = { dragging: true, startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y }
  }, [pos])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const d = dragRef.current
      if (!d.dragging) return
      setPos({
        x: Math.max(0, Math.min(window.innerWidth - 380, d.origX + (e.clientX - d.startX))),
        y: Math.max(0, Math.min(window.innerHeight - 100, d.origY + (e.clientY - d.startY))),
      })
    }
    const handleMouseUp = () => { dragRef.current.dragging = false }
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

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
    // Swap input/output
    if (output) {
      setInput(output)
      setOutput(input)
      setWordByWord([])
    }
  }

  const sourceLang = direction === 'sv-en' ? 'Svenska' : 'English'
  const targetLang = direction === 'sv-en' ? 'English' : 'Svenska'

  // Toggle button (always visible)
  if (!open) {
    return (
      <button
        className="translate-fab"
        onClick={() => setOpen(true)}
        title="Translate"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 8l6 6" /><path d="M4 14l6-6 2-3" /><path d="M2 5h12" /><path d="M7 2h1" />
          <path d="M22 22l-5-10-5 10" /><path d="M14 18h6" />
        </svg>
      </button>
    )
  }

  return (
    <div
      ref={widgetRef}
      className="translate-widget"
      style={{ left: pos.x, top: pos.y }}
      onMouseDown={handleMouseDown}
    >
      {/* Header - draggable */}
      <div className="translate-header">
        <span className="translate-grip">{'\u2630'}</span>
        <span className="translate-title">Translate</span>
        <button className="translate-close" onClick={() => setOpen(false)}>&times;</button>
      </div>

      <div className="translate-body">
        {/* Direction selector */}
        <div className="translate-direction">
          <span className={`translate-lang${direction === 'sv-en' ? ' active' : ''}`}>{sourceLang}</span>
          <button className="translate-swap" onClick={swapDirection} title="Swap languages">
            {'\u21C4'}
          </button>
          <span className={`translate-lang${direction === 'en-sv' ? '' : ''}`}>{targetLang}</span>
        </div>

        {/* Input */}
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

        {/* Output */}
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
  )
}
