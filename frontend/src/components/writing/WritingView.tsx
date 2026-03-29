import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useExamFlow } from '../../hooks/useExamFlow'
import { useTimer } from '../../hooks/useTimer'
import { generateMock, generatePractice, evaluateWriting, fetchPrompts } from '../../api/writing'
import type { WritingTask, WritingMockData, WritingPrompts } from '../../types/exam'
import type { EvalResult } from '../../types/api'
import { useFullExam } from '../../context/FullExamContext'
import { escapeHtml } from '../../utils/format'
import '../../styles/yki.css'

type MenuSubView = 'none' | 'mock' | 'practice'

interface WritingExamPayload {
  tasks: WritingTask[]
  title: string
}

const BADGES: Record<string, string> = {
  informal: 'badge-informal',
  complaint: 'badge-formal',
  review: 'badge-formal',
  argumentative: 'badge-argumentative',
}

const TYPE_LABELS: Record<string, string> = {
  informal: 'Informellt mejl',
  complaint: 'Klagom\u00e5l',
  review: 'Recension',
  argumentative: 'Argumenterande',
}

export default function WritingView() {
  const navigate = useNavigate()
  const { activeSection, completeSection } = useFullExam()
  const isFullExam = activeSection === 'writing'

  const {
    phase, examData, score, feedback, loadingMessage,
    startLoading, setExamData, setResults, backToMenu, startEvaluating,
  } = useExamFlow<WritingExamPayload>()

  const [menuSub, setMenuSub] = useState<MenuSubView>('none')
  const [practiceType, setPracticeType] = useState('')
  const [pendingTask, setPendingTask] = useState<WritingTask | null>(null)
  const [showBrowser, setShowBrowser] = useState(false)
  const [prompts, setPrompts] = useState<WritingPrompts>({})
  const [taskAnswers, setTaskAnswers] = useState<Record<number, string>>({})
  const [wordCounts, setWordCounts] = useState<Record<number, number>>({})
  const [timerSeconds, setTimerSeconds] = useState(3240) // 54 min default
  const timerExpiredRef = useRef(false)

  const handleTimerExpire = useCallback(() => {
    timerExpiredRef.current = true
  }, [])

  const timer = useTimer(timerSeconds, { onExpire: handleTimerExpire })

  useEffect(() => {
    if (timerExpiredRef.current && phase === 'exam') {
      timerExpiredRef.current = false
      handleSubmit()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timerExpiredRef.current, phase])

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
      startLoading(true, 'Generating writing tasks...')
      generateMock()
        .then((data: WritingMockData) => {
          setTimerSeconds(data.total_minutes * 60)
          setExamData({ tasks: data.tasks, title: 'Writing \u2014 Full Exam' })
          setTaskAnswers({})
          setWordCounts({})
        })
        .catch(err => {
          alert(err instanceof Error ? err.message : 'Failed')
          backToMenu()
        })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleMockStart = async () => {
    startLoading(true, 'Generating writing tasks...')
    try {
      const data = await generateMock()
      setTimerSeconds(data.total_minutes * 60)
      setExamData({ tasks: data.tasks, title: 'Writing Mock Exam' })
      setTaskAnswers({})
      setWordCounts({})
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed')
      backToMenu()
    }
  }

  const handlePracticeRandom = async () => {
    startLoading(false, 'Generating prompt...')
    try {
      const data = await generatePractice(practiceType || undefined)
      setPendingTask(data)
      backToMenu()
      setMenuSub('practice')
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed')
      backToMenu()
    }
  }

  const handleBrowseOpen = async () => {
    setShowBrowser(true)
    setPendingTask(null)
    try {
      const data = await fetchPrompts()
      setPrompts(data)
    } catch {
      setPrompts({})
    }
  }

  const handleBrowseSelect = async (type: string, index: number) => {
    startLoading(false, 'Loading prompt...')
    try {
      const data = await generatePractice(type, index)
      setPendingTask(data)
      backToMenu()
      setMenuSub('practice')
      setShowBrowser(false)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed')
      backToMenu()
    }
  }

  const handleStartPractice = () => {
    if (!pendingTask) return
    setTimerSeconds(pendingTask.time_minutes * 60)
    setExamData({ tasks: [pendingTask], title: `Practice \u2014 ${pendingTask.label}` })
    setTaskAnswers({})
    setWordCounts({})
    setPendingTask(null)
  }

  const updateAnswer = (index: number, value: string) => {
    setTaskAnswers(prev => ({ ...prev, [index]: value }))
    const wc = value.trim() ? value.trim().split(/\s+/).length : 0
    setWordCounts(prev => ({ ...prev, [index]: wc }))
  }

  const handleSubmit = async () => {
    if (!examData) return
    timer.stop()
    startEvaluating()

    const answerList = examData.tasks.map((_t, i) => (taskAnswers[i] || '').trim())

    try {
      const result: EvalResult = await evaluateWriting(examData.tasks, answerList)
      const evalScore = result.score || 0
      let fb = result.feedback || ''
      if (result.task_feedback) {
        result.task_feedback.forEach((tf, i) => {
          fb += `\n\nTask ${i + 1} (${tf.score || 0}%): ${tf.feedback || ''}`
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

  // Filter prompts by type for browser
  const filteredPrompts: Record<string, { index: number; title: string }[]> = {}
  for (const [cat, items] of Object.entries(prompts)) {
    if (practiceType && cat !== practiceType) continue
    if (items.length > 0) filteredPrompts[cat] = items
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
            <div className="score-label">Writing Score</div>
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
          <h2>{examData.title}</h2>
          <div className={`exam-timer ${timer.timerClass}`}>{timer.display}</div>
        </div>

        {examData.tasks.map((t, i) => (
          <div className="writing-task" key={i}>
            <div className="task-header">
              <h3>Task {i + 1}</h3>
              <span className={`task-type-badge ${BADGES[t.type] || ''}`}>{escapeHtml(t.label)}</span>
            </div>
            <p style={{ marginBottom: 12, lineHeight: 1.6, fontSize: 15 }}>{t.prompt}</p>
            <p style={{ fontSize: 12, color: 'var(--text-light)', marginBottom: 8 }}>
              Word limit: ~{t.word_limit} words | Time: {t.time_minutes} min
            </p>
            {t.template && (
              <details style={{ marginBottom: 12 }}>
                <summary style={{ fontSize: 12, color: 'var(--primary)', cursor: 'pointer' }}>
                  Show example template
                </summary>
                <pre style={{
                  fontSize: 12, background: 'var(--bg)', padding: 12,
                  borderRadius: 'var(--radius-sm)', whiteSpace: 'pre-wrap', marginTop: 8,
                }}>
                  {t.template}
                </pre>
              </details>
            )}
            <textarea
              className="answer-textarea"
              rows={10}
              placeholder="Skriv ditt svar p\u00e5 svenska..."
              value={taskAnswers[i] || ''}
              onChange={e => updateAnswer(i, e.target.value)}
            />
            <div className="word-counter">{wordCounts[i] || 0} words</div>
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
      <h2 style={{ marginBottom: 20 }}>Writing</h2>
      <div className="yki-dashboard">
        <div className="yki-card" onClick={() => { setMenuSub('mock'); setPendingTask(null); setShowBrowser(false) }}>
          <div className="yki-card-icon">&#x1F4DD;</div>
          <h3>Mock Test</h3>
          <p>Full writing section, timed</p>
          <div className="yki-card-time">54 min</div>
          <div className="yki-card-cta">Start Mock Exam &rarr;</div>
        </div>
        <div className="yki-card" onClick={() => { setMenuSub('practice'); setPendingTask(null); setShowBrowser(false) }}>
          <div className="yki-card-icon">&#x270D;&#xFE0F;</div>
          <h3>Practice</h3>
          <p>Individual task, flexible timing</p>
          <div className="yki-card-cta">Start Practice &rarr;</div>
        </div>
      </div>

      {menuSub === 'mock' && (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)', padding: 20, marginBottom: 16,
        }}>
          <h3 style={{ fontSize: 15, marginBottom: 12 }}>Mock Test</h3>
          <p style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 16 }}>
            You will receive multiple writing tasks to complete within 54 minutes.
          </p>
          <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleMockStart}>
            Start Mock Exam (54 min)
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
            <label style={{ fontSize: 13, fontWeight: 500 }}>Task Type</label>
            <select
              className="form-select"
              value={practiceType}
              onChange={e => setPracticeType(e.target.value)}
              style={{ width: '100%', marginTop: 4 }}
            >
              <option value="">Random</option>
              <option value="informal">Informal</option>
              <option value="complaint">Complaint</option>
              <option value="review">Review</option>
              <option value="argumentative">Argumentative</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={handlePracticeRandom}>
              Random Prompt
            </button>
            <button className="btn" style={{ flex: 1 }} onClick={handleBrowseOpen}>
              Browse Prompts
            </button>
          </div>

          {/* Pending practice task confirm */}
          {pendingTask && !showBrowser && (
            <div style={{
              marginTop: 16, padding: 16, background: 'var(--bg)',
              borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
            }}>
              <span className="badge" style={{ marginBottom: 8, display: 'inline-block' }}>
                {escapeHtml(pendingTask.label)}
              </span>
              <h3 style={{ fontSize: 15, marginBottom: 8 }}>{pendingTask.prompt}</h3>
              <p style={{ fontSize: 12, color: 'var(--text-light)' }}>
                ~{pendingTask.word_limit} words | {pendingTask.time_minutes} min timer
              </p>
              <button
                className="btn btn-primary"
                style={{ marginTop: 12, width: '100%' }}
                onClick={handleStartPractice}
              >
                Start Practice
              </button>
            </div>
          )}

          {/* Browser */}
          {showBrowser && (
            <div style={{ marginTop: 16, maxHeight: 400, overflowY: 'auto' }}>
              {Object.keys(filteredPrompts).length === 0 ? (
                <p className="empty-state">No prompts found.</p>
              ) : (
                Object.entries(filteredPrompts).map(([cat, items]) => (
                  <div key={cat}>
                    <div style={{
                      fontSize: 11, fontWeight: 600, color: 'var(--text-light)',
                      textTransform: 'uppercase', padding: '6px 0',
                    }}>
                      {TYPE_LABELS[cat] || cat}
                    </div>
                    {items.map(p => (
                      <div
                        key={`${cat}-${p.index}`}
                        onClick={() => handleBrowseSelect(cat, p.index)}
                        style={{
                          padding: '8px 12px', border: '1px solid var(--border-light)',
                          borderRadius: 'var(--radius-sm)', marginBottom: 4, cursor: 'pointer',
                        }}
                      >
                        <strong style={{ fontSize: 13 }}>{p.title}</strong>
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
