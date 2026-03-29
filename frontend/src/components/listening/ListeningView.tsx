import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useExamFlow } from '../../hooks/useExamFlow'
import { useTimer } from '../../hooks/useTimer'
import {
  generateListening, evaluateListening, fetchPassages as fetchClips,
  fetchClip, getAudioUrl,
} from '../../api/listening'
import type { ListeningExamData, ListeningPassageItem, ExamQuestion } from '../../types/exam'
import type { EvalResult } from '../../types/api'
import { useFullExam } from '../../context/FullExamContext'
import { normalizeOptions } from '../../utils/exam'
import '../../styles/yki.css'

type MenuSubView = 'none' | 'mock' | 'practice'

export default function ListeningView() {
  const navigate = useNavigate()
  const { activeSection, completeSection } = useFullExam()
  const isFullExam = activeSection === 'listening'

  const {
    phase, examData, isMock, score, feedback, loadingMessage,
    startLoading, setExamData, setResults, backToMenu, startEvaluating,
  } = useExamFlow<ListeningExamData>()

  const [menuSub, setMenuSub] = useState<MenuSubView>('none')
  const [mockCategory, setMockCategory] = useState('')
  const [practiceCategory, setPracticeCategory] = useState('')
  const [clipList, setClipList] = useState<ListeningPassageItem[]>([])
  const [showBrowser, setShowBrowser] = useState(false)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [playCounts, setPlayCounts] = useState<Record<number, number>>({})
  const [timerSeconds, setTimerSeconds] = useState(2400)
  const timerExpiredRef = useRef(false)
  const audioRefs = useRef<Record<number, HTMLAudioElement | null>>({})
  const [pendingPractice, setPendingPractice] = useState<{ data: ListeningExamData; timerSecs: number } | null>(null)
  const [pendingLoading, setPendingLoading] = useState(false)
  const [autoPlayStatus, setAutoPlayStatus] = useState<string | null>(null)
  const autoPlayAbortRef = useRef(false)

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      Object.values(audioRefs.current).forEach(a => { if (a) { a.pause(); a.src = '' } })
      audioRefs.current = {}
    }
  }, [])

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

  // Auto-play clips sequentially when exam starts, then start timer
  useEffect(() => {
    if (phase !== 'exam' || !examData) return
    autoPlayAbortRef.current = false

    const runAutoPlay = async () => {
      setAutoPlayStatus('Preparing audio...')
      await new Promise(r => setTimeout(r, 1000))
      if (autoPlayAbortRef.current) return

      for (let ci = 0; ci < examData.clips.length; ci++) {
        const clip = examData.clips[ci]
        if (!clip || autoPlayAbortRef.current) break
        const resolvedUrl = clip.audio_url.startsWith('/') ? clip.audio_url : getAudioUrl(clip.audio_url)

        // Play 1
        setAutoPlayStatus(`Playing clip ${ci + 1} of ${examData.clips.length}... (1st listen)`)
        setPlayCounts(prev => ({ ...prev, [ci]: (prev[ci] || 0) + 1 }))
        await playOnce(resolvedUrl, ci)
        if (autoPlayAbortRef.current) break

        // Brief pause between plays
        await new Promise(r => setTimeout(r, 1500))
        if (autoPlayAbortRef.current) break

        // Play 2
        setAutoPlayStatus(`Playing clip ${ci + 1} of ${examData.clips.length}... (2nd listen)`)
        setPlayCounts(prev => ({ ...prev, [ci]: (prev[ci] || 0) + 1 }))
        await playOnce(resolvedUrl, ci)
        if (autoPlayAbortRef.current) break

        // Pause between clips
        if (ci < examData.clips.length - 1) {
          setAutoPlayStatus('Next clip starting soon...')
          await new Promise(r => setTimeout(r, 2000))
        }
      }
      if (autoPlayAbortRef.current) return

      // All clips played — start the timer for answering
      setAutoPlayStatus(null)
      timer.reset(timerSeconds)
      timer.start()
    }

    function playOnce(url: string, clipIndex: number): Promise<void> {
      return new Promise(resolve => {
        const audio = new Audio(url)
        audioRefs.current[clipIndex] = audio
        audio.addEventListener('ended', () => { audioRefs.current[clipIndex] = null; resolve() })
        audio.addEventListener('error', () => { audioRefs.current[clipIndex] = null; resolve() })
        audio.play().catch(() => { audioRefs.current[clipIndex] = null; resolve() })
      })
    }

    runAutoPlay()

    return () => {
      autoPlayAbortRef.current = true
      timer.stop()
      Object.values(audioRefs.current).forEach(a => { if (a) { a.pause(); a.src = '' } })
      audioRefs.current = {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, examData])

  // Auto-start for full exam
  const fullExamStartedRef = useRef(false)
  useEffect(() => {
    if (isFullExam && !fullExamStartedRef.current) {
      fullExamStartedRef.current = true
      startLoading(true, 'Generating listening exam...')
      generateListening('', 2)
        .then(data => {
          setTimerSeconds(2400)
          setExamData(data)
          setAnswers({})
          setPlayCounts({})
        })
        .catch(err => {
          alert(err instanceof Error ? err.message : 'Failed')
          backToMenu()
        })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFullExam])

  const handleMockStart = async () => {
    startLoading(true, 'Generating listening exam...')
    try {
      const data = await generateListening(mockCategory, 2)
      setTimerSeconds(2400)
      setExamData(data)
      setAnswers({})
      setPlayCounts({})
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed')
      backToMenu()
    }
  }

  const handlePracticeRandom = async () => {
    setPendingLoading(true)
    setPendingPractice(null)
    try {
      const data = await generateListening(practiceCategory, 1)
      const clipWords = data.clips.reduce((sum, c) => sum + c.text.split(/\s+/).length, 0)
      const secs = Math.max(420, Math.ceil(clipWords / 150) * 180)
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
      const all = await fetchClips()
      setClipList(all)
    } catch {
      setClipList([])
    }
  }

  const handleBrowseSelect = async (index: number) => {
    setPendingLoading(true)
    setPendingPractice(null)
    setShowBrowser(false)
    try {
      const data = await fetchClip(index)
      const clipWords = data.clips.reduce((sum, c) => sum + c.text.split(/\s+/).length, 0)
      const secs = Math.max(420, Math.ceil(clipWords / 150) * 180)
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
    setPlayCounts({})
    setPendingPractice(null)
  }

  const handlePlay = (clipIndex: number, audioUrl: string) => {
    const current = playCounts[clipIndex] || 0
    if (isMock && current >= 2) {
      alert('No plays remaining.')
      return
    }

    // Stop any currently playing audio for this clip
    if (audioRefs.current[clipIndex]) {
      audioRefs.current[clipIndex]!.pause()
      audioRefs.current[clipIndex] = null
    }

    const resolvedUrl = audioUrl.startsWith('/') ? audioUrl : getAudioUrl(audioUrl)
    const audio = new Audio(resolvedUrl)
    audioRefs.current[clipIndex] = audio

    setPlayCounts(prev => ({ ...prev, [clipIndex]: current + 1 }))

    audio.addEventListener('ended', () => {
      audioRefs.current[clipIndex] = null
    })
    audio.addEventListener('error', () => {
      audioRefs.current[clipIndex] = null
    })
    audio.play().catch(() => {
      audioRefs.current[clipIndex] = null
    })
  }

  const setAnswer = (qid: string, value: string) => {
    setAnswers(prev => ({ ...prev, [qid]: value }))
  }

  const handleSubmit = async () => {
    if (!examData) return
    autoPlayAbortRef.current = true
    setAutoPlayStatus(null)
    timer.stop()

    // Stop any playing audio
    Object.values(audioRefs.current).forEach(a => { if (a) { a.pause(); a.src = '' } })
    audioRefs.current = {}

    startEvaluating()

    const answerList: string[] = []
    examData.clips.forEach((clip, ci) => {
      clip.questions.forEach((_q, qi) => {
        const qid = `ls-${ci}-${qi}`
        answerList.push(answers[qid] || '')
      })
    })

    try {
      const result: EvalResult = await evaluateListening(answerList, examData.clips)
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
    autoPlayAbortRef.current = true
    setAutoPlayStatus(null)
    timer.stop()
    Object.values(audioRefs.current).forEach(a => { if (a) { a.pause(); a.src = '' } })
    audioRefs.current = {}
    if (isFullExam) {
      navigate('/yki')
    } else {
      backToMenu()
    }
  }

  // Group clips by source for browser
  const filteredClips = practiceCategory
    ? clipList.filter(c => c.category === practiceCategory)
    : clipList
  const groupedClips: Record<string, (ListeningPassageItem & { origIndex: number })[]> = {}
  filteredClips.forEach(c => {
    const idx = clipList.indexOf(c)
    if (!groupedClips[c.source]) groupedClips[c.source] = []
    groupedClips[c.source]!.push({ ...c, origIndex: idx })
  })

  const renderQuestion = (q: ExamQuestion, ci: number, qi: number) => {
    const qid = `ls-${ci}-${qi}`
    if (q.type === 'mc') {
      return (
        <div className="question-block" key={qid}>
          <div className="question-text">{ci + 1}.{qi + 1} {q.question}</div>
          <div className="question-options">
            {normalizeOptions(q.options).map(opt => (
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
          <div className="question-text">{ci + 1}.{qi + 1} {q.question}</div>
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
        <div className="question-text">{ci + 1}.{qi + 1} {q.question}</div>
        <textarea
          className="answer-textarea"
          rows={2}
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
            <div className="score-label">Listening Score</div>
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
          <button className="btn btn-small" onClick={handleBack} style={{ marginRight: 12 }}>
            &larr; Exit
          </button>
          <h2 style={{ flex: 1 }}>{isMock ? 'Listening Mock Exam' : 'Listening Practice'}</h2>
          <div className={`exam-timer ${timer.timerClass}`}>
            {autoPlayStatus ? 'Listening phase' : timer.display}
          </div>
        </div>

        {autoPlayStatus && (
          <div style={{
            padding: '16px 20px', marginBottom: 16, background: '#eff6ff',
            borderRadius: 'var(--radius-sm)', border: '1px solid #bfdbfe',
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <span style={{ fontSize: 20 }}>{'\uD83C\uDFA7'}</span>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--primary)' }}>{autoPlayStatus}</div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>
                Listen carefully. The timer will start after all clips have been played.
              </div>
            </div>
          </div>
        )}

        {examData.clips.map((clip, ci) => {
          const plays = playCounts[ci] || 0
          const maxPlays = isMock ? 2 : Infinity
          const playsLeft = maxPlays - plays

          return (
            <div className="passage-block" key={ci}>
              <h3 style={{ marginBottom: 12 }}>{clip.title}</h3>
              <div className="audio-player-block">
                <button
                  className="btn"
                  disabled={(isMock && playsLeft <= 0) || !!autoPlayStatus}
                  onClick={() => handlePlay(ci, clip.audio_url)}
                >
                  {plays > 0 ? 'Replay Audio' : 'Play Audio'}
                </button>
                <span className="plays-remaining">
                  {autoPlayStatus
                    ? 'Auto-playing...'
                    : isMock
                      ? playsLeft > 0 ? `${playsLeft} extra replay${playsLeft !== 1 ? 's' : ''} available` : 'No replays remaining'
                      : 'Unlimited replays'}
                </span>
              </div>
              {clip.questions.map((q, qi) => renderQuestion(q, ci, qi))}
            </div>
          )
        })}

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
      <h2 style={{ marginBottom: 20 }}>Listening Comprehension</h2>
      <div className="yki-dashboard">
        <div className="yki-card" onClick={() => { setMenuSub('mock'); setShowBrowser(false); setPendingPractice(null) }}>
          <div className="yki-card-icon">&#x1F3A7;</div>
          <h3>Mock Test</h3>
          <p>2 clips, timed 40 minutes</p>
          <div className="yki-card-time">40 min</div>
          <div className="yki-card-cta">Start Mock Exam &rarr;</div>
        </div>
        <div className="yki-card" onClick={() => { setMenuSub('practice'); setShowBrowser(false); setPendingPractice(null) }}>
          <div className="yki-card-icon">&#x1F50A;</div>
          <h3>Practice</h3>
          <p>Single clip, flexible timing</p>
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
            Start Mock Exam (40 min)
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
              {pendingLoading ? 'Loading...' : 'Random Clip'}
            </button>
            <button className="btn" style={{ flex: 1 }} onClick={handleBrowseOpen} disabled={pendingLoading}>
              Browse Clips
            </button>
          </div>

          {/* Pending practice preview */}
          {pendingPractice && !showBrowser && (
            <div style={{
              marginTop: 16, padding: 16, background: 'var(--bg)',
              borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
            }}>
              {pendingPractice.data.clips.map((clip, i) => (
                <div key={i} style={{ marginBottom: i < pendingPractice.data.clips.length - 1 ? 12 : 0 }}>
                  <strong style={{ fontSize: 14 }}>{clip.title}</strong>
                  <p style={{ fontSize: 12, color: 'var(--text-light)', marginTop: 4 }}>
                    {clip.questions.length} question{clip.questions.length !== 1 ? 's' : ''}
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
              {clipList.length === 0 ? (
                <p style={{ color: 'var(--text-light)', padding: 8 }}>Loading...</p>
              ) : Object.keys(groupedClips).length === 0 ? (
                <p className="empty-state">No clips found.</p>
              ) : (
                Object.entries(groupedClips).map(([source, items]) => (
                  <div key={source}>
                    <div style={{
                      fontSize: 11, fontWeight: 600, color: 'var(--text-light)',
                      textTransform: 'uppercase', padding: '8px 0 4px',
                    }}>
                      {source}
                    </div>
                    {items.map(c => (
                      <div
                        key={c.origIndex}
                        onClick={() => handleBrowseSelect(c.origIndex)}
                        style={{
                          padding: '8px 12px', border: '1px solid var(--border-light)',
                          borderRadius: 'var(--radius-sm)', marginBottom: 4, cursor: 'pointer',
                        }}
                      >
                        <strong style={{ fontSize: 13 }}>{c.title}</strong>
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
