import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { fetchItems, createItem, deleteItem, submitDrill, fetchDueItems } from '../../api/memorization'
import { fetchVoices, synthesize, deleteFile, getPlayUrl } from '../../api/tts'
import { useTimer } from '../../hooks/useTimer'
import type { MemorizationItem, DrillSubmission } from '../../types/memorization'
import { DRILL_MODES } from '../../types/memorization'
import '../../styles/memorization.css'

type ViewMode = 'list' | 'create' | 'drill' | 'results'

/* ================================================================ */
/*  Utility functions                                                */
/* ================================================================ */

/** Fuzzy word match: case-insensitive, allow Levenshtein <= 1 for long words */
function wordsMatch(a: string, b: string): boolean {
  const na = a.toLowerCase().normalize('NFC')
  const nb = b.toLowerCase().normalize('NFC')
  if (na === nb) return true
  if (na.length > 5 || nb.length > 5) return levenshtein(na, nb) <= 1
  return false
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))
  for (let i = 0; i <= m; i++) dp[i]![0] = i
  for (let j = 0; j <= n; j++) dp[0]![j] = j
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i]![j] = Math.min(
        dp[i - 1]![j]! + 1,
        dp[i]![j - 1]! + 1,
        dp[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
  return dp[m]![n]!
}

/** Word-by-word diff: returns array of { word, status } */
function wordDiff(expected: string[], actual: string[]): { word: string; status: 'correct' | 'wrong' | 'missing' | 'extra' }[] {
  const result: { word: string; status: 'correct' | 'wrong' | 'missing' | 'extra' }[] = []
  let ei = 0, ai = 0
  while (ei < expected.length && ai < actual.length) {
    if (wordsMatch(expected[ei]!, actual[ai]!)) {
      result.push({ word: expected[ei]!, status: 'correct' })
      ei++; ai++
    } else {
      // Check if expected word appears soon in actual (insertion)
      const lookAhead = actual.slice(ai, ai + 3).findIndex(w => wordsMatch(expected[ei]!, w))
      if (lookAhead > 0) {
        for (let k = 0; k < lookAhead; k++) result.push({ word: actual[ai + k]!, status: 'extra' })
        ai += lookAhead
      } else {
        result.push({ word: expected[ei]!, status: 'wrong' })
        ei++; ai++
      }
    }
  }
  while (ei < expected.length) { result.push({ word: expected[ei]!, status: 'missing' }); ei++ }
  while (ai < actual.length) { result.push({ word: actual[ai]!, status: 'extra' }); ai++ }
  return result
}

/** Generate blank positions for fill-the-blanks mode */
function generateBlanks(words: string[], ratio = 0.3): Set<number> {
  const blanks = new Set<number>()
  const count = Math.max(1, Math.round(words.length * ratio))
  // Score words: prefer content words (longer)
  const scored = words.map((w, i) => ({ i, score: w.length + Math.random() * 3 }))
  scored.sort((a, b) => b.score - a.score)
  for (const { i } of scored) {
    if (blanks.size >= count) break
    // Avoid consecutive blanks
    if (blanks.has(i - 1) || blanks.has(i + 1)) continue
    blanks.add(i)
  }
  // If not enough, fill in remaining
  if (blanks.size < count) {
    for (let i = 0; i < words.length && blanks.size < count; i++) {
      if (!blanks.has(i)) blanks.add(i)
    }
  }
  return blanks
}

/** Generate first-letter skeleton */
function firstLetterSkeleton(text: string): string {
  return text.split(/\s+/).map(w => {
    if (w.length <= 1) return w
    return w[0] + '_'.repeat(w.length - 1)
  }).join(' ')
}

/* ================================================================ */
/*  Component                                                        */
/* ================================================================ */

export default function MemorizationView() {
  const [mode, setMode] = useState<ViewMode>('list')
  const [items, setItems] = useState<MemorizationItem[]>([])
  const [dueItems, setDueItems] = useState<MemorizationItem[]>([])
  const [search, setSearch] = useState('')
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Create state
  const [newTitle, setNewTitle] = useState('')
  const [newText, setNewText] = useState('')

  // Drill state
  const [drillItem, setDrillItem] = useState<MemorizationItem | null>(null)
  const [chunkIndex, setChunkIndex] = useState(0)
  const [drillMode, setDrillMode] = useState(0)
  const [userInput, setUserInput] = useState('')
  const [blanksAnswers, setBlanksAnswers] = useState<Record<number, string>>({})
  const [blanksPositions, setBlanksPositions] = useState<Set<number>>(new Set())
  const [revealed, setRevealed] = useState(false)
  const [drillScore, setDrillScore] = useState<number | null>(null)
  const [diffResult, setDiffResult] = useState<{ word: string; status: string }[]>([])
  const [hintUsed, setHintUsed] = useState(false)
  const [drillStartTime, setDrillStartTime] = useState(0)

  // Results state
  const [sessionScores, setSessionScores] = useState<{ chunk: number; mode: number; score: number }[]>([])

  // TTS state
  const [speakUrl, setSpeakUrl] = useState<string | null>(null)
  const [, setSpeakFile] = useState<{ folder: string; name: string } | null>(null)
  const [speakLoading, setSpeakLoading] = useState(false)
  const speakAudioRef = useRef<HTMLAudioElement>(null)
  const speakFileRef = useRef<{ folder: string; name: string } | null>(null)

  // Speed round timer
  const timerExpiredRef = useRef(false)
  const handleTimerExpire = useCallback(() => { timerExpiredRef.current = true }, [])
  const timer = useTimer(60, { onExpire: handleTimerExpire })

  /* ---- Data loading ---- */
  const loadItems = useCallback(async () => {
    const data = await fetchItems(search || undefined)
    setItems(data)
  }, [search])

  const loadDue = useCallback(async () => {
    const data = await fetchDueItems()
    setDueItems(data)
  }, [])

  useEffect(() => { loadItems() }, [loadItems])
  useEffect(() => { loadDue() }, [])

  const handleSearchInput = (val: string) => {
    setSearch(val)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(loadItems, 300)
  }

  /* ---- TTS ---- */
  const cleanupSpeak = useCallback(() => {
    if (speakAudioRef.current) speakAudioRef.current.pause()
    if (speakFileRef.current) deleteFile(speakFileRef.current.folder, speakFileRef.current.name).catch(() => {})
    setSpeakUrl(null)
    setSpeakFile(null)
    speakFileRef.current = null
  }, [])

  useEffect(() => () => { if (speakFileRef.current) deleteFile(speakFileRef.current.folder, speakFileRef.current.name).catch(() => {}) }, [])

  const speakText = useCallback(async (text: string) => {
    cleanupSpeak()
    setSpeakLoading(true)
    try {
      const voices = await fetchVoices()
      if (!voices[0]) { setSpeakLoading(false); return }
      const data = await synthesize({ text, voice_id: voices[0].id, format: 'wav', save_path: '', filename: '' })
      const url = getPlayUrl(data.folder, data.filename)
      setSpeakUrl(url)
      setSpeakFile({ folder: data.folder, name: data.filename })
      speakFileRef.current = { folder: data.folder, name: data.filename }
      setSpeakLoading(false)
      setTimeout(() => speakAudioRef.current?.play(), 100)
    } catch { setSpeakLoading(false) }
  }, [cleanupSpeak])

  /* ---- Create ---- */
  const handleCreate = async () => {
    if (!newText.trim()) return
    const item = await createItem({ title: newTitle.trim() || 'Untitled', original_text: newText.trim() })
    setNewTitle('')
    setNewText('')
    startDrill(item)
  }

  /* ---- Delete ---- */
  const handleDelete = async (id: number) => {
    if (!confirm('Delete this memorization item?')) return
    await deleteItem(id)
    loadItems()
    loadDue()
  }

  /* ---- Drill management ---- */
  const startDrill = (item: MemorizationItem) => {
    setDrillItem(item)
    setChunkIndex(0)
    setDrillMode(0)
    setSessionScores([])
    resetDrillState()
    setMode('drill')
  }

  const resetDrillState = () => {
    setUserInput('')
    setBlanksAnswers({})
    setRevealed(false)
    setDrillScore(null)
    setDiffResult([])
    setHintUsed(false)
    setDrillStartTime(Date.now())
    timerExpiredRef.current = false
    timer.stop()
    cleanupSpeak()
  }

  const currentChunk = drillItem?.chunks[chunkIndex] ?? ''
  const chunkWords = useMemo(() => currentChunk.split(/\s+/).filter(Boolean), [currentChunk])
  const fullText = drillItem?.original_text ?? ''
  const fullTextWords = useMemo(() => fullText.split(/\s+/).filter(Boolean), [fullText])
  // For modes 3 & 4, we use the full text instead of individual chunks
  const isFullTextMode = drillMode === 3 || drillMode === 4

  // Init blanks when entering mode 1
  useEffect(() => {
    if (drillMode === 1 && chunkWords.length > 0 && !revealed) {
      const positions = generateBlanks(chunkWords)
      setBlanksPositions(positions)
      setBlanksAnswers({})
    }
  }, [drillMode, chunkIndex, chunkWords.length, revealed])

  // Start timer for speed round
  useEffect(() => {
    if (drillMode === 4 && mode === 'drill' && !revealed) {
      const secs = Math.max(15, fullTextWords.length * 3)
      timer.reset(secs)
      timer.start()
      setDrillStartTime(Date.now())
    }
  }, [drillMode, chunkIndex, mode])

  // Auto-submit on speed round timer expire
  useEffect(() => {
    if (timerExpiredRef.current && drillMode === 4 && !revealed) {
      timerExpiredRef.current = false
      handleSubmitDrill()
    }
  }, [timerExpiredRef.current])

  /* ---- Submit drill ---- */
  const handleSubmitDrill = async () => {
    if (!drillItem) return
    timer.stop()
    const timeSecs = Math.round((Date.now() - drillStartTime) / 1000)
    let score = 1.0
    let diff: { word: string; status: string }[] = []

    if (drillMode === 0) {
      // Read & Listen — always 100%
      score = 1.0
    } else if (drillMode === 1) {
      // Fill the blanks
      let correct = 0
      const total = blanksPositions.size
      blanksPositions.forEach(pos => {
        if (wordsMatch(chunkWords[pos] ?? '', blanksAnswers[pos] ?? '')) correct++
      })
      score = total > 0 ? correct / total : 1.0
    } else if (drillMode === 2) {
      // First letters
      const actualWords = userInput.trim().split(/\s+/).filter(Boolean)
      diff = wordDiff(chunkWords, actualWords)
      const correct = diff.filter(d => d.status === 'correct').length
      score = chunkWords.length > 0 ? correct / chunkWords.length : 1.0
    } else if (drillMode === 3 || drillMode === 4) {
      // Recall & Write / Speed Round — compare against FULL text
      const actualWords = userInput.trim().split(/\s+/).filter(Boolean)
      diff = wordDiff(fullTextWords, actualWords)
      const correct = diff.filter(d => d.status === 'correct').length
      score = fullTextWords.length > 0 ? correct / fullTextWords.length : 1.0
      if (hintUsed) score = Math.max(0, score - 0.1)
      if (drillMode === 4) {
        const maxTime = Math.max(15, fullTextWords.length * 3)
        const timeRatio = Math.min(1, timeSecs / maxTime)
        const timeBonus = timeRatio < 0.5 ? 1.0 : 1.0 - (timeRatio - 0.5) * 0.6
        score *= timeBonus
      }
    }

    score = Math.max(0, Math.min(1, score))
    setDrillScore(Math.round(score * 100))
    setDiffResult(diff)
    setRevealed(true)

    const submission: DrillSubmission = {
      chunk_index: chunkIndex,
      mode: drillMode,
      score,
      time_spent_seconds: timeSecs,
    }
    const updated = await submitDrill(drillItem.id, submission)
    setDrillItem(updated)
    setSessionScores(prev => [...prev, { chunk: chunkIndex, mode: drillMode, score: Math.round(score * 100) }])
  }

  /** Advance: next chunk at same mode, or next mode from chunk 0, or finish.
   *  Modes 3 & 4 are full-text (no chunk iteration), so skip straight to next mode. */
  const handleNext = () => {
    if (!drillItem) return
    if (!isFullTextMode && chunkIndex < drillItem.chunks.length - 1) {
      // More chunks at this mode — go to next chunk
      setChunkIndex(chunkIndex + 1)
      resetDrillState()
    } else if (drillMode < 4) {
      // Advance to next mode, start at chunk 0
      setDrillMode(drillMode + 1)
      setChunkIndex(0)
      resetDrillState()
    } else {
      // All done
      setMode('results')
    }
  }

  const selectDrillMode = (modeId: number) => {
    if (!drillItem) return
    // Can only select if unlocked: mode 0 always, others if previous mode highest >= 80%
    if (modeId > 0 && drillItem.highest_mode_completed < modeId - 1) return
    setDrillMode(modeId)
    resetDrillState()
  }

  const backToList = () => {
    setMode('list')
    cleanupSpeak()
    timer.stop()
    loadItems()
    loadDue()
  }

  /* ---- Keyboard shortcuts for drill ---- */
  useEffect(() => {
    if (mode !== 'drill') return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && e.ctrlKey && !revealed) {
        e.preventDefault()
        handleSubmitDrill()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [mode, revealed, drillMode, userInput, blanksAnswers])

  /* ================================================================ */
  /*  RENDER: List mode                                                */
  /* ================================================================ */
  if (mode === 'list') {
    return (
      <div className="mem-page">
        <div className="mem-header">
          <h2>Memorization</h2>
          <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => setMode('create')}>+ New Item</button>
        </div>

        <div className="mem-search">
          <input type="text" placeholder="Search items..." value={search} onChange={e => handleSearchInput(e.target.value)} />
        </div>

        {/* Due for review */}
        {dueItems.length > 0 && (
          <div className="mem-due-section">
            <h3 className="mem-section-title">Due for Review</h3>
            <div className="mem-grid">
              {dueItems.map(item => (
                <div key={item.id} className="mem-card mem-card-due" onClick={() => startDrill(item)}>
                  <div className="mem-card-title">{item.title}</div>
                  <div className="mem-card-preview">{item.original_text.substring(0, 80)}{item.original_text.length > 80 ? '...' : ''}</div>
                  <div className="mem-card-meta">
                    <div className="mem-mastery-bar"><div className="mem-mastery-fill" style={{ width: `${item.mastery_level}%` }} /></div>
                    <span className="mem-mastery-label">{item.mastery_level}%</span>
                    <span className="badge mem-due-badge">Due</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* All items */}
        <h3 className="mem-section-title">All Items</h3>
        {items.length === 0 ? (
          <p className="empty-state">No memorization items yet. Create one to get started!</p>
        ) : (
          <div className="mem-grid">
            {items.map(item => (
              <div key={item.id} className="mem-card" onClick={() => startDrill(item)}>
                <div className="mem-card-header">
                  <div className="mem-card-title">{item.title}</div>
                  <button className="mem-delete-btn" title="Delete" onClick={e => { e.stopPropagation(); handleDelete(item.id) }}>&times;</button>
                </div>
                <div className="mem-card-preview">{item.original_text.substring(0, 80)}{item.original_text.length > 80 ? '...' : ''}</div>
                <div className="mem-card-meta">
                  <div className="mem-mastery-bar"><div className="mem-mastery-fill" style={{ width: `${item.mastery_level}%` }} /></div>
                  <span className="mem-mastery-label">{item.mastery_level}%</span>
                  <span className="mem-card-chunks">{item.chunks.length} chunk{item.chunks.length !== 1 ? 's' : ''}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  /* ================================================================ */
  /*  RENDER: Create mode                                              */
  /* ================================================================ */
  if (mode === 'create') {
    const previewChunks = newText.trim() ? newText.trim().split(/[.?!]\s+|\n+/).filter(s => s.trim()).length : 0
    return (
      <div className="mem-page">
        <div className="mem-header">
          <h2>New Memorization Item</h2>
          <button className="btn" onClick={backToList}>Cancel</button>
        </div>
        <div className="mem-create-form">
          <div className="form-group">
            <label>Title</label>
            <input type="text" placeholder="E.g. 'Swedish national anthem'" value={newTitle} onChange={e => setNewTitle(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Text to memorize</label>
            <textarea rows={8} placeholder="Paste or type the text you want to memorize..." value={newText} onChange={e => setNewText(e.target.value)} />
          </div>
          {newText.trim() && (
            <p style={{ fontSize: 13, color: 'var(--text-light)' }}>
              ~{previewChunks} chunk{previewChunks !== 1 ? 's' : ''} | {newText.trim().split(/\s+/).length} words
            </p>
          )}
          <button className="btn btn-primary" style={{ width: '100%', marginTop: 12 }} onClick={handleCreate} disabled={!newText.trim()}>
            Save & Start Drilling
          </button>
        </div>
      </div>
    )
  }

  /* ================================================================ */
  /*  RENDER: Results mode                                             */
  /* ================================================================ */
  if (mode === 'results') {
    const avgScore = sessionScores.length > 0
      ? Math.round(sessionScores.reduce((s, x) => s + x.score, 0) / sessionScores.length)
      : 0
    return (
      <div className="mem-page">
        <div className="mem-header">
          <h2>Session Complete</h2>
        </div>
        <div className="mem-results">
          <div className="review-complete-icon">&#x1F389;</div>
          <div className="review-score-ring">
            <span className="review-score-number">{avgScore}%</span>
          </div>
          <p style={{ color: 'var(--text-dim)', marginBottom: 24 }}>{sessionScores.length} drill{sessionScores.length !== 1 ? 's' : ''} completed</p>

          <div className="mem-results-list">
            {sessionScores.map((s, i) => (
              <div key={i} className="mem-result-row">
                <span>Chunk {s.chunk + 1} &mdash; {DRILL_MODES[s.mode as 0|1|2|3|4]?.label}</span>
                <span className={s.score >= 80 ? 'text-success' : 'text-danger'}>{s.score}%</span>
              </div>
            ))}
          </div>

          {drillItem && (
            <div style={{ marginTop: 20, textAlign: 'center' }}>
              <p style={{ fontSize: 14, color: 'var(--text-dim)' }}>Overall mastery: <strong>{drillItem.mastery_level}%</strong></p>
            </div>
          )}

          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 24 }}>
            {drillItem && <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => startDrill(drillItem)}>Drill Again</button>}
            <button className="btn" onClick={backToList}>Back to List</button>
          </div>
        </div>
      </div>
    )
  }

  /* ================================================================ */
  /*  RENDER: Drill mode                                               */
  /* ================================================================ */
  if (mode === 'drill' && drillItem) {
    const totalChunks = drillItem.chunks.length
    const isFullText = drillMode === 3 || drillMode === 4
    const nextLabel = (!isFullText && chunkIndex < totalChunks - 1)
      ? `Next Chunk (${chunkIndex + 2}/${totalChunks})`
      : drillMode < 4
        ? `Next: ${DRILL_MODES[(drillMode + 1) as 0|1|2|3|4]?.label}`
        : 'Finish'
    const canUnlock = (modeId: number) => modeId === 0 || drillItem.highest_mode_completed >= modeId - 1

    return (
      <div className="mem-page mem-drill-page">
        {/* Top bar */}
        <div className="mem-drill-topbar">
          <button className="btn btn-small" onClick={backToList}>&larr; Exit</button>
          <div className="mem-drill-title">{drillItem.title}</div>
          <div className="mem-drill-counter">Chunk {chunkIndex + 1}/{totalChunks}</div>
        </div>

        {/* Mode selector */}
        <div className="mem-mode-selector">
          {DRILL_MODES.map(m => (
            <button
              key={m.id}
              className={`mem-mode-pill${drillMode === m.id ? ' active' : ''}${!canUnlock(m.id) ? ' locked' : ''}`}
              onClick={() => canUnlock(m.id) && selectDrillMode(m.id)}
              disabled={!canUnlock(m.id)}
              title={canUnlock(m.id) ? m.label : 'Complete previous mode first'}
            >
              <span>{m.icon}</span>
              <span className="mem-mode-pill-label">{m.label}</span>
              {!canUnlock(m.id) && <span className="mem-lock-icon">&#x1F512;</span>}
            </button>
          ))}
        </div>

        {/* Drill area */}
        <div className="mem-drill-area">
          {/* Mode 0: Read & Listen */}
          {drillMode === 0 && (
            <div className="mem-drill-content">
              <div className="mem-drill-label">Read along and listen carefully</div>
              <div className="mem-read-text">{currentChunk}</div>
              <div className="mem-drill-actions">
                <button className="btn" onClick={() => speakText(currentChunk)} disabled={speakLoading}>
                  {speakLoading ? 'Loading...' : speakUrl ? 'Replay Audio' : 'Play Audio'}
                </button>
                {!revealed ? (
                  <button className="btn btn-primary" onClick={handleSubmitDrill}>Mark as Read</button>
                ) : (
                  <button className="btn btn-primary" onClick={handleNext}>{nextLabel}</button>
                )}
              </div>
            </div>
          )}

          {/* Mode 1: Fill the Blanks */}
          {drillMode === 1 && (
            <div className="mem-drill-content">
              <div className="mem-drill-label">Fill in the missing words</div>
              <div className="mem-blanks-text">
                {chunkWords.map((w, i) => {
                  if (!blanksPositions.has(i)) {
                    return <span key={i} className="mem-blanks-word">{w} </span>
                  }
                  if (revealed) {
                    const correct = wordsMatch(w, blanksAnswers[i] ?? '')
                    return (
                      <span key={i} className={`mem-blank-result ${correct ? 'correct' : 'wrong'}`}>
                        {blanksAnswers[i] || '___'}
                        {!correct && <span className="mem-blank-expected">{w}</span>}
                        {' '}
                      </span>
                    )
                  }
                  return (
                    <input
                      key={i}
                      className="mem-blank-input"
                      style={{ width: Math.max(40, w.length * 10) }}
                      value={blanksAnswers[i] ?? ''}
                      onChange={e => setBlanksAnswers(prev => ({ ...prev, [i]: e.target.value }))}
                      placeholder={'_'.repeat(w.length)}
                    />
                  )
                })}
              </div>
              <div className="mem-drill-actions">
                {!revealed ? (
                  <button className="btn btn-primary" onClick={handleSubmitDrill}>Check Answers</button>
                ) : (
                  <>
                    <div className="mem-score-display">{drillScore}%</div>
                    <button className="btn btn-primary" onClick={handleNext}>{nextLabel}</button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Mode 2: First Letters */}
          {drillMode === 2 && (
            <div className="mem-drill-content">
              <div className="mem-drill-label">Use the first letters as clues to recall the full text</div>
              <div className="mem-skeleton-text">{firstLetterSkeleton(currentChunk)}</div>
              {!revealed ? (
                <>
                  <textarea
                    className="mem-recall-textarea"
                    rows={4}
                    placeholder="Type the full text..."
                    value={userInput}
                    onChange={e => setUserInput(e.target.value)}
                  />
                  <div className="mem-drill-actions">
                    <button className="btn btn-primary" onClick={handleSubmitDrill}>Check</button>
                  </div>
                </>
              ) : (
                <>
                  <div className="mem-diff-display">
                    {diffResult.map((d, i) => (
                      <span key={i} className={`mem-diff-word mem-diff-${d.status}`}>{d.word} </span>
                    ))}
                  </div>
                  <div className="mem-drill-actions">
                    <div className="mem-score-display">{drillScore}%</div>
                    <button className="btn btn-primary" onClick={handleNext}>{nextLabel}</button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Mode 3: Recall & Write */}
          {drillMode === 3 && (
            <div className="mem-drill-content">
              <div className="mem-drill-label">Write the entire text from memory</div>
              {hintUsed && (
                <div className="mem-hint-text">{fullTextWords.slice(0, 3).join(' ')}...</div>
              )}
              {!revealed ? (
                <>
                  <textarea
                    className="mem-recall-textarea"
                    rows={10}
                    placeholder="Type the entire text from memory..."
                    value={userInput}
                    onChange={e => setUserInput(e.target.value)}
                  />
                  <div className="mem-drill-actions">
                    {!hintUsed && (
                      <button className="btn" onClick={() => setHintUsed(true)}>Show Hint (-10%)</button>
                    )}
                    <button className="btn btn-primary" onClick={handleSubmitDrill}>Check</button>
                  </div>
                </>
              ) : (
                <>
                  <div className="mem-diff-display">
                    {diffResult.map((d, i) => (
                      <span key={i} className={`mem-diff-word mem-diff-${d.status}`}>{d.word} </span>
                    ))}
                  </div>
                  <div className="mem-original-reveal">
                    <strong>Original:</strong> {isFullTextMode ? fullText : currentChunk}
                  </div>
                  <div className="mem-drill-actions">
                    <div className="mem-score-display">{drillScore}%</div>
                    <button className="btn btn-primary" onClick={handleNext}>{nextLabel}</button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Mode 4: Speed Round */}
          {drillMode === 4 && (
            <div className="mem-drill-content">
              <div className="mem-drill-label">Speed recall — type as fast as you can!</div>
              {!revealed && (
                <div className={`mem-speed-timer ${timer.timerClass}`}>{timer.display}</div>
              )}
              {!revealed ? (
                <>
                  <textarea
                    className="mem-recall-textarea"
                    rows={5}
                    placeholder="Type from memory — clock is ticking!"
                    value={userInput}
                    onChange={e => setUserInput(e.target.value)}
                    autoFocus
                  />
                  <div className="mem-drill-actions">
                    <button className="btn btn-primary" onClick={handleSubmitDrill}>Submit</button>
                  </div>
                </>
              ) : (
                <>
                  <div className="mem-diff-display">
                    {diffResult.map((d, i) => (
                      <span key={i} className={`mem-diff-word mem-diff-${d.status}`}>{d.word} </span>
                    ))}
                  </div>
                  <div className="mem-original-reveal">
                    <strong>Original:</strong> {isFullTextMode ? fullText : currentChunk}
                  </div>
                  <div className="mem-drill-actions">
                    <div className="mem-score-display">{drillScore}%</div>
                    <button className="btn btn-primary" onClick={handleNext}>{nextLabel}</button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* TTS Player */}
        {(speakUrl || speakLoading) && (
          <div className="speak-player-bar">
            {speakLoading ? (
              <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>Generating audio...</span>
            ) : (
              <>
                <audio ref={speakAudioRef} src={speakUrl ?? undefined} controls style={{ flex: 1, height: 36 }} />
                <div className="speak-speed-controls">
                  {[0.5, 0.75, 1, 1.25, 1.5].map(s => (
                    <button key={s} className="btn btn-small" onClick={() => { if (speakAudioRef.current) speakAudioRef.current.playbackRate = s }}>{s}x</button>
                  ))}
                </div>
                <button className="btn btn-small btn-danger" onClick={cleanupSpeak}>&times;</button>
              </>
            )}
          </div>
        )}
      </div>
    )
  }

  return null
}
