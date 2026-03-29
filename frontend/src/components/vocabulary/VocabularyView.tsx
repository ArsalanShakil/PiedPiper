import { useState, useEffect, useRef, useCallback } from 'react'
import { fetchVocabulary, deleteVocab, fetchReviewItems, submitReview, fetchCategories, getExportUrl } from '../../api/vocabulary'
import type { VocabItem } from '../../types/api'
import '../../styles/vocabulary.css'

export default function VocabularyView() {
  const [items, setItems] = useState<VocabItem[]>([])
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [categories, setCategories] = useState<string[]>([])
  const [mode, setMode] = useState<'list' | 'review'>('list')

  // Flashcard state
  const [reviewItems, setReviewItemsState] = useState<VocabItem[]>([])
  const [reviewIndex, setReviewIndex] = useState(0)
  const [reviewScore, setReviewScore] = useState(0)
  const [revealed, setRevealed] = useState(false)

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const loadVocab = useCallback(async () => {
    const data = await fetchVocabulary(search || undefined, category || undefined)
    setItems(data)
  }, [search, category])

  useEffect(() => { loadVocab() }, [loadVocab])
  useEffect(() => { fetchCategories().then(setCategories) }, [])

  const handleSearchInput = (val: string) => {
    setSearch(val)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => loadVocab(), 300)
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this word?')) return
    await deleteVocab(id)
    loadVocab()
  }

  const startReview = async () => {
    const items = await fetchReviewItems(20)
    if (items.length === 0) { alert('No vocabulary to review. Add some words first!'); return }
    setReviewItemsState(items)
    setReviewIndex(0)
    setReviewScore(0)
    setRevealed(false)
    setMode('review')
  }

  const handleReviewAnswer = async (knewIt: boolean) => {
    const item = reviewItems[reviewIndex]
    if (!item) return
    if (knewIt) setReviewScore(s => s + 1)
    await submitReview(item.id, knewIt)
    setRevealed(false)
    setReviewIndex(i => i + 1)
  }

  const backToList = () => {
    setMode('list')
    loadVocab()
  }

  // Keyboard shortcuts for review
  useEffect(() => {
    if (mode !== 'review') return
    const handler = (e: KeyboardEvent) => {
      if (reviewIndex >= reviewItems.length) return
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        setRevealed(true)
      } else if (revealed && (e.key === 'ArrowLeft' || e.key === '1')) {
        handleReviewAnswer(false)
      } else if (revealed && (e.key === 'ArrowRight' || e.key === '2')) {
        handleReviewAnswer(true)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [mode, revealed, reviewIndex, reviewItems.length])

  if (mode === 'review') {
    const currentItem = reviewItems[reviewIndex]
    const isComplete = reviewIndex >= reviewItems.length
    const progress = reviewItems.length > 0 ? ((reviewIndex) / reviewItems.length) * 100 : 0

    return (
      <div id="vocab-page" className="review-page">
        {/* Top bar */}
        <div className="review-topbar">
          <button className="btn btn-small" onClick={backToList}>&larr; Exit</button>
          <div className="review-counter">{Math.min(reviewIndex + 1, reviewItems.length)} / {reviewItems.length}</div>
          <div style={{ width: 60 }} />
        </div>

        {/* Progress bar */}
        <div className="review-progress-bar">
          <div className="review-progress-fill" style={{ width: `${progress}%` }} />
        </div>

        <div className="flashcard-container">
          {isComplete ? (
            <div className="review-complete">
              <div className="review-complete-icon">&#x1F389;</div>
              <h3>Review Complete!</h3>
              <div className="review-score-ring">
                <span className="review-score-number">{reviewItems.length > 0 ? Math.round((reviewScore / reviewItems.length) * 100) : 0}%</span>
              </div>
              <p>{reviewScore} of {reviewItems.length} correct</p>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 24 }}>
                <button className="btn btn-primary" style={{ width: 'auto' }} onClick={startReview}>Review Again</button>
                <button className="btn" onClick={backToList}>Back to List</button>
              </div>
            </div>
          ) : currentItem && (
            <>
              {/* Flip card */}
              <div className={`flashcard-flip${revealed ? ' flipped' : ''}`} onClick={() => setRevealed(r => !r)}>
                <div className="flashcard-inner">
                  <div className="flashcard-front">
                    <div className="flashcard-label">SWEDISH</div>
                    <div className="flashcard-word">{currentItem.swedish_text}</div>
                    <div className="flashcard-hint">Tap to flip</div>
                  </div>
                  <div className="flashcard-back">
                    <div className="flashcard-label">TRANSLATION</div>
                    <div className="flashcard-translation">{currentItem.translation}</div>
                    {currentItem.context && (
                      <div className="flashcard-context">{currentItem.context}</div>
                    )}
                  </div>
                </div>
              </div>

              {/* Answer buttons */}
              <div className={`flashcard-actions${revealed ? ' visible' : ''}`}>
                <button className="review-btn review-btn-miss" onClick={() => handleReviewAnswer(false)}>
                  <span className="review-btn-icon">&#x2717;</span>
                  <span>Still learning</span>
                </button>
                <button className="review-btn review-btn-hit" onClick={() => handleReviewAnswer(true)}>
                  <span className="review-btn-icon">&#x2713;</span>
                  <span>Got it!</span>
                </button>
              </div>

              {!revealed && (
                <div className="flashcard-shortcut-hint">Press Space to flip</div>
              )}
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <div id="vocab-page">
      <div className="vocab-header">
        <h2>Vocabulary</h2>
        <div className="vocab-actions">
          <button className="btn" onClick={() => window.open(getExportUrl(), '_blank')}>Export CSV</button>
          <button className="btn btn-primary" style={{ width: 'auto' }} onClick={startReview}>Review Flashcards</button>
        </div>
      </div>

      <div className="vocab-search">
        <input type="text" placeholder="Search words..." value={search} onChange={e => handleSearchInput(e.target.value)} />
        <select value={category} onChange={e => setCategory(e.target.value)}>
          <option value="">All Categories</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div className="vocab-list">
        {items.length === 0 ? (
          <p className="empty-state">No vocabulary yet. Save words from the Writing Editor!</p>
        ) : (
          items.map(v => (
            <div key={v.id} className="vocab-item">
              <span className="vocab-sv">{v.swedish_text}</span>
              <span className="vocab-en">{v.translation}</span>
              <div className="vocab-meta">
                <div className="difficulty-dots">
                  {[0, 1, 2, 3, 4].map(i => (
                    <div key={i} className={`difficulty-dot${i < v.difficulty ? ' filled' : ''}`} />
                  ))}
                </div>
                <button className="btn btn-small btn-danger" onClick={() => handleDelete(v.id)}>Delete</button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
