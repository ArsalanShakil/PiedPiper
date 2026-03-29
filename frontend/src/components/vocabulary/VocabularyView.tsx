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

  if (mode === 'review') {
    const currentItem = reviewItems[reviewIndex]
    const isComplete = reviewIndex >= reviewItems.length

    return (
      <div id="vocab-page">
        <div className="vocab-header">
          <h2>Flashcard Review</h2>
          <button className="btn" onClick={backToList}>Back to List</button>
        </div>
        <div className="flashcard-container">
          {isComplete ? (
            <div className="review-complete">
              <h3>Review Complete!</h3>
              <p>You got {reviewScore} out of {reviewItems.length} correct.</p>
              <button className="btn btn-primary" style={{ width: 'auto' }} onClick={backToList}>Back to List</button>
            </div>
          ) : currentItem && (
            <>
              <div className="flashcard" onClick={() => setRevealed(true)}>
                <div className="flashcard-word">{currentItem.swedish_text}</div>
                {!revealed && <div className="flashcard-hint">Click to reveal translation</div>}
                <div className={`flashcard-answer${revealed ? ' revealed' : ''}`}>{currentItem.translation}</div>
                {currentItem.context && (
                  <div className={`flashcard-grammar${revealed ? ' revealed' : ''}`}>{currentItem.context}</div>
                )}
              </div>
              {revealed && (
                <div className="flashcard-buttons" style={{ display: 'flex' }}>
                  <button className="btn btn-danger" style={{ minWidth: 120 }} onClick={() => handleReviewAnswer(false)}>Didn't know</button>
                  <button className="btn btn-primary" style={{ width: 'auto', minWidth: 120 }} onClick={() => handleReviewAnswer(true)}>Knew it!</button>
                </div>
              )}
              <div className="flashcard-progress">{reviewIndex + 1} / {reviewItems.length}</div>
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
