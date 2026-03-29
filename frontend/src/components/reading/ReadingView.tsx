import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useExamFlow } from '../../hooks/useExamFlow'
import { useTimer } from '../../hooks/useTimer'
import { generateReading, evaluateReading, fetchPassages, fetchPassage } from '../../api/reading'
import type { ReadingExamData, PassageListItem, ExamQuestion } from '../../types/exam'
import type { EvalResult } from '../../types/api'
import { useFullExam } from '../../context/FullExamContext'
import { escapeHtml } from '../../utils/format'
import '../../styles/yki.css'

type MenuSubView = 'none' | 'mock' | 'practice'

export default function ReadingView() {
  const navigate = useNavigate()
  const { activeSection, completeSection } = useFullExam()
  const isFullExam = activeSection === 'reading'

  const {
    phase, examData, isMock, score, feedback, loadingMessage,
    startLoading, setExamData, setResults, backToMenu, startEvaluating,
  } = useExamFlow<ReadingExamData>()

  const [menuSub, setMenuSub] = useState<MenuSubView>('none')
  const [mockCategory, setMockCategory] = useState('')
  const [practiceCategory, setPracticeCategory] = useState('')
  const [passages, setPassages] = useState<PassageListItem[]>([])
  const [showBrowser, setShowBrowser] = useState(false)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [pendingPractice, setPendingPractice] = useState<{ data: ReadingExamData; timerSecs: number } | null>(null)
  const [pendingLoading, setPendingLoading] = useState(false)

  // Timer: we compute seconds when exam phase starts
  const [timerSeconds, setTimerSeconds] = useState(3600)
  const timerExpiredRef = useRef(false)

  const handleTimerExpire = useCallback(() => {
    timerExpiredRef.current = true
  }, [])

  const timer = useTimer(timerSeconds, { onExpire: handleTimerExpire })

  // When timer expires, auto-submit
  useEffect(() => {
    if (timerExpiredRef.current && phase === 'exam') {
      timerExpiredRef.current = false
      handleSubmit()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timerExpiredRef.current, phase])

  // Start timer when entering exam phase
  useEffect(() => {
    if (phase === 'exam') {
      timer.reset(timerSeconds)
      timer.start()
    }
    return () => { timer.stop() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, timerSeconds])

  // Auto-start for full exam
  useEffect(() => {
    if (isFullExam) {
      startLoading(true, 'Generating questions with AI...')
      generateReading('', 3)
        .then(data => {
          setTimerSeconds(3600)
          setExamData(data)
          setAnswers({})
        })
        .catch(err => {
          alert(err instanceof Error ? err.message : 'Failed')
          backToMenu()
        })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleMockStart = async () => {
    startLoading(true, 'Generating questions with AI...')
    try {
      const data = await generateReading(mockCategory, 3)
      setTimerSeconds(3600)
      setExamData(data)
      setAnswers({})
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed')
      backToMenu()
    }
  }

  const handlePracticeRandom = async () => {
    setPendingLoading(true)
    setPendingPractice(null)
    try {
      const data = await generateReading(practiceCategory, 1)
      const wordCount = data.passages.reduce((sum, p) => sum + p.text.split(/\s+/).length, 0)
      const secs = Math.max(600, Math.ceil(wordCount / 100) * 120)
      setPendingPractice({ data, timerSecs: secs })
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed')
    } finally {
      setPendingLoading(false)
    }
  }

  const handleBrowseOpen = async () => {
    setShowBrowser(true)
    try {
      const all = await fetchPassages()
      setPassages(all)
    } catch {
      setPassages([])
    }
  }

  const handleBrowseSelect = async (index: number) => {
    setPendingLoading(true)
    setPendingPractice(null)
    setShowBrowser(false)
    try {
      const data = await fetchPassage(index)
      const wordCount = data.passages.reduce((sum, p) => sum + p.text.split(/\s+/).length, 0)
      const secs = Math.max(600, Math.ceil(wordCount / 100) * 120)
      setPendingPractice({ data, timerSecs: secs })
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed')
    } finally {
      setPendingLoading(false)
    }
  }

  const handleStartPendingPractice = () => {
    if (!pendingPractice) return
    setTimerSeconds(pendingPractice.timerSecs)
    setExamData(pendingPractice.data)
    setAnswers({})
    setPendingPractice(null)
  }

  const setAnswer = (qid: string, value: string) => {
    setAnswers(prev => ({ ...prev, [qid]: value }))
  }

  const handleSubmit = async () => {
    if (!examData) return
    timer.stop()
    startEvaluating()

    // Collect answers in order
    const answerList: string[] = []
    examData.passages.forEach((p, pi) => {
      p.questions.forEach((_q, qi) => {
        const qid = `rd-${pi}-${qi}`
        answerList.push(answers[qid] || '')
      })
    })

    try {
      const result: EvalResult = await evaluateReading(answerList, examData.passages)
      const evalScore = result.score || 0
      let fb = result.feedback || 'No feedback.'
      if (result.details) {
        result.details.forEach((d, i) => {
          fb += `\nQ${i + 1}: ${d.correct ? 'Correct' : 'Incorrect'} (your: ${d.your_answer}, correct: ${d.correct_answer})`
        })
      }
      setResults(evalScore, fb)

      if (isFullExam) {
        setTimeout(() => completeSection(evalScore), 2000)
      }
    } catch (err) {
      setResults(0, err instanceof Error ? err.message : 'Evaluation failed')
    }
  }

  const handleBack = () => {
    timer.stop()
    if (isFullExam) {
      navigate('/yki')
    } else {
      backToMenu()
    }
  }

  // Group passages by source for browser
  const filteredPassages = practiceCategory
    ? passages.filter(p => p.category === practiceCategory)
    : passages
  const groupedPassages: Record<string, (PassageListItem & { origIndex: number })[]> = {}
  filteredPassages.forEach(p => {
    const idx = passages.indexOf(p)
    if (!groupedPassages[p.source]) groupedPassages[p.source] = []
    groupedPassages[p.source]!.push({ ...p, origIndex: idx })
  })

  // Render question helper
  const renderQuestion = (q: ExamQuestion, pi: number, qi: number) => {
    const qid = `rd-${pi}-${qi}`
    if (q.type === 'mc') {
      return (
        <div className="question-block" key={qid}>
          <div className="question-text">{pi + 1}.{qi + 1} {q.question}</div>
          <div className="question-options">
            {(q.options || []).map(opt => (
              <label
                key={opt}
                className={`option-label${answers[qid] === opt ? ' selected' : ''}`}
                onClick={() => setAnswer(qid, opt)}
              >
                <input
                  type="radio"
                  name={qid}
                  value={opt}
                  checked={answers[qid] === opt}
                  onChange={() => setAnswer(qid, opt)}
                />
                <span>{opt}</span>
              </label>
            ))}
          </div>
        </div>
      )
    }
    if (q.type === 'tf') {
      return (
        <div className="question-block" key={qid}>
          <div className="question-text">{pi + 1}.{qi + 1} {q.question}</div>
          <div className="question-options">
            {['sant', 'falskt'].map(val => (
              <label
                key={val}
                className={`option-label${answers[qid] === val ? ' selected' : ''}`}
                onClick={() => setAnswer(qid, val)}
              >
                <input
                  type="radio"
                  name={qid}
                  value={val}
                  checked={answers[qid] === val}
                  onChange={() => setAnswer(qid, val)}
                />
                <span>{val === 'sant' ? 'Sant' : 'Falskt'}</span>
              </label>
            ))}
          </div>
        </div>
      )
    }
    // open
    return (
      <div className="question-block" key={qid}>
        <div className="question-text">{pi + 1}.{qi + 1} {q.question}</div>
        <textarea
          className="answer-textarea"
          rows={3}
          placeholder="Skriv ditt svar..."
          value={answers[qid] || ''}
          onChange={e => setAnswer(qid, e.target.value)}
        />
      </div>
    )
  }

  // ---- LOADING ----
  if (phase === 'loading') {
    return (
      <div className="generating-overlay">
        <h3>{loadingMessage}</h3>
        <p>This may take a moment...</p>
      </div>
    )
  }

  // ---- RESULTS ----
  if (phase === 'results') {
    return (
      <div>
        <div className="results-panel">
          <div className="score-display">
            <div className="score-number">{score}%</div>
            <div className="score-label">Reading Score</div>
          </div>
          <div className="feedback-text">{feedback}</div>
        </div>
        {!isFullExam && (
          <button className="btn" style={{ marginTop: 16 }} onClick={handleBack}>
            Back to Menu
          </button>
        )}
      </div>
    )
  }

  // ---- EXAM ----
  if (phase === 'exam' && examData) {
    return (
      <div>
        <div className="exam-header">
          <h2>{isMock ? 'Reading Mock Exam' : 'Reading Practice'}</h2>
          <div className={`exam-timer ${timer.timerClass}`}>{timer.display}</div>
        </div>

        {examData.passages.map((p, pi) => (
          <div className="passage-block" key={pi}>
            <h3 style={{ marginBottom: 4 }}>{p.title}</h3>
            <p style={{ fontSize: 11, color: 'var(--text-light)', marginBottom: 12 }}>
              {escapeHtml(p.source || '')}
            </p>
            <div className="passage-text">{p.text}</div>
            {p.questions.map((q, qi) => renderQuestion(q, pi, qi))}
          </div>
        ))}

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button className="btn btn-primary" onClick={handleSubmit}>Submit Answers</button>
          {!isFullExam && (
            <button className="btn" onClick={handleBack}>Back</button>
          )}
        </div>
      </div>
    )
  }

  // ---- MENU ----
  return (
    <div>
      <button className="btn" style={{ marginBottom: 16 }} onClick={() => navigate('/yki')}>
        &larr; Back to YKI
      </button>
      <h2 style={{ marginBottom: 20 }}>Reading Comprehension</h2>
      <div className="yki-dashboard">
        <div className="yki-card" onClick={() => { setMenuSub('mock'); setShowBrowser(false); setPendingPractice(null) }}>
          <div className="yki-card-icon">&#x1F4DA;</div>
          <h3>Mock Test</h3>
          <p>3 passages, timed 60 minutes</p>
          <div className="yki-card-time">60 min</div>
          <div className="yki-card-cta">Start Mock Exam &rarr;</div>
        </div>
        <div className="yki-card" onClick={() => { setMenuSub('practice'); setShowBrowser(false); setPendingPractice(null) }}>
          <div className="yki-card-icon">&#x1F4D6;</div>
          <h3>Practice</h3>
          <p>Single passage, flexible timing</p>
          <div className="yki-card-cta">Start Practice &rarr;</div>
        </div>
      </div>

      {menuSub === 'mock' && (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)', padding: 20, marginBottom: 16,
        }}>
          <h3 style={{ fontSize: 15, marginBottom: 12 }}>Mock Test Options</h3>
          <div className="form-group">
            <label style={{ fontSize: 13, fontWeight: 500 }}>Category (optional)</label>
            <select
              className="form-select"
              value={mockCategory}
              onChange={e => setMockCategory(e.target.value)}
              style={{ width: '100%', marginTop: 4 }}
            >
              <option value="">Any</option>
              <option value="stories">Stories</option>
              <option value="news">News</option>
            </select>
          </div>
          <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleMockStart}>
            Start Mock Exam (60 min)
          </button>
        </div>
      )}

      {menuSub === 'practice' && (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)', padding: 20, marginBottom: 16,
        }}>
          <h3 style={{ fontSize: 15, marginBottom: 12 }}>Practice Options</h3>
          <div className="form-group">
            <label style={{ fontSize: 13, fontWeight: 500 }}>Category (optional)</label>
            <select
              className="form-select"
              value={practiceCategory}
              onChange={e => setPracticeCategory(e.target.value)}
              style={{ width: '100%', marginTop: 4 }}
            >
              <option value="">Any</option>
              <option value="stories">Stories</option>
              <option value="news">News</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={handlePracticeRandom} disabled={pendingLoading}>
              {pendingLoading ? 'Loading...' : 'Random Passage'}
            </button>
            <button className="btn" style={{ flex: 1 }} onClick={handleBrowseOpen} disabled={pendingLoading}>
              Browse Passages
            </button>
          </div>

          {/* Pending practice preview */}
          {pendingPractice && !showBrowser && (
            <div style={{
              marginTop: 16, padding: 16, background: 'var(--bg)',
              borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
            }}>
              {pendingPractice.data.passages.map((p, i) => (
                <div key={i} style={{ marginBottom: i < pendingPractice.data.passages.length - 1 ? 12 : 0 }}>
                  <strong style={{ fontSize: 14 }}>{p.title}</strong>
                  <p style={{ fontSize: 12, color: 'var(--text-light)', marginTop: 4 }}>
                    {p.source ? `Source: ${p.source}` : ''}{p.source ? ' | ' : ''}{p.text.length} chars | {p.questions.length} question{p.questions.length !== 1 ? 's' : ''}
                  </p>
                </div>
              ))}
              <p style={{ fontSize: 12, color: 'var(--text-light)', marginTop: 8 }}>
                Timer: {Math.floor(pendingPractice.timerSecs / 60)} min
              </p>
              <button
                className="btn btn-primary"
                style={{ marginTop: 12, width: '100%' }}
                onClick={handleStartPendingPractice}
              >
                Start Practice
              </button>
            </div>
          )}

          {showBrowser && (
            <div style={{ marginTop: 16, maxHeight: 400, overflowY: 'auto' }}>
              {passages.length === 0 ? (
                <p style={{ color: 'var(--text-light)', padding: 8 }}>Loading...</p>
              ) : Object.keys(groupedPassages).length === 0 ? (
                <p className="empty-state">No passages found.</p>
              ) : (
                Object.entries(groupedPassages).map(([source, items]) => (
                  <div key={source}>
                    <div style={{
                      fontSize: 11, fontWeight: 600, color: 'var(--text-light)',
                      textTransform: 'uppercase', padding: '8px 0 4px',
                    }}>
                      {source}
                    </div>
                    {items.map(p => (
                      <div
                        key={p.origIndex}
                        onClick={() => handleBrowseSelect(p.origIndex)}
                        style={{
                          padding: '8px 12px', border: '1px solid var(--border-light)',
                          borderRadius: 'var(--radius-sm)', marginBottom: 4, cursor: 'pointer',
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        }}
                      >
                        <strong style={{ fontSize: 13 }}>{p.title}</strong>
                        <span style={{ fontSize: 11, color: 'var(--text-light)' }}>{p.length} chars</span>
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
