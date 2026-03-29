import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { fetchSessions } from '../../api/yki'
import type { ExamSession } from '../../types/api'
import { useFullExam } from '../../context/FullExamContext'
import { formatDate } from '../../utils/format'
import '../../styles/yki.css'

export default function YkiDashboardView() {
  const [sessions, setSessions] = useState<ExamSession[]>([])
  const [sessionsLoading, setSessionsLoading] = useState(true)
  const [showConfirm, setShowConfirm] = useState(false)
  const { state: fullExamState, startFullExam, startNextSection, abortExam } = useFullExam()

  const fullExamInProgress = fullExamState !== null &&
    fullExamState.currentSection < fullExamState.sections.length

  useEffect(() => {
    fetchSessions()
      .then(s => setSessions(s))
      .catch(() => {})
      .finally(() => setSessionsLoading(false))
  }, [])

  const handleStartFullExam = useCallback(() => {
    startFullExam()
    setShowConfirm(false)
  }, [startFullExam])

  const handleAbort = useCallback(() => {
    if (window.confirm('Abort the full exam? Progress will be lost.')) {
      abortExam()
    }
  }, [abortExam])

  return (
    <div>
      <h2 style={{ marginBottom: 20 }}>YKI Exam Practice</h2>

      {/* Full Mock Exam Banner */}
      {!fullExamInProgress && (
        <div
          onClick={() => setShowConfirm(true)}
          style={{
            background: 'linear-gradient(135deg, #5b5fc7, #7c3aed)',
            color: 'white',
            borderRadius: 'var(--radius)',
            padding: '24px',
            marginBottom: 20,
            cursor: 'pointer',
          }}
        >
          <div style={{ fontSize: 28, marginBottom: 8 }}>&#x1F3AF;</div>
          <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4, color: 'white' }}>Full Mock Exam</h3>
          <p style={{ fontSize: 13, opacity: 0.9 }}>
            All 4 sections back-to-back: Reading, Listening, Writing, Speaking (3 hours)
          </p>
        </div>
      )}

      {/* Confirm Dialog */}
      {showConfirm && (
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            padding: 24,
            marginBottom: 20,
          }}
        >
          <h3 style={{ fontSize: 16, marginBottom: 12 }}>Start Full Mock Exam?</h3>
          <p style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 16 }}>
            You will take all 4 sections one after another. Each section is timed individually.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            {[
              { icon: '\uD83D\uDCD6', label: 'Reading', time: '60 min' },
              { icon: '\uD83C\uDFA7', label: 'Listening', time: '40 min' },
              { icon: '\uD83D\uDCDD', label: 'Writing', time: '54 min' },
              { icon: '\uD83C\uDFA4', label: 'Speaking', time: '25 min' },
            ].map(s => (
              <div
                key={s.label}
                style={{
                  padding: '10px 14px',
                  border: '1px solid var(--border-light)',
                  borderRadius: 'var(--radius-sm)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  fontSize: 14,
                }}
              >
                <span style={{ fontSize: 18 }}>{s.icon}</span>
                <strong>{s.label}</strong>
                <span style={{ fontSize: 12, color: 'var(--text-light)', marginLeft: 'auto' }}>{s.time}</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" onClick={handleStartFullExam}>
              Start Full Exam
            </button>
            <button className="btn" onClick={() => setShowConfirm(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Full Exam Progress Tracker */}
      {fullExamInProgress && fullExamState && (
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            padding: 24,
            marginBottom: 20,
          }}
        >
          <h3 style={{ fontSize: 16, marginBottom: 12 }}>Full Exam In Progress</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
            {fullExamState.sections.map((s, i) => {
              const isDone = i < fullExamState.currentSection
              const isCurrent = i === fullExamState.currentSection
              const score = fullExamState.scores[s.type]

              let badgeStyle: React.CSSProperties = {}
              let badgeText = 'Pending'
              let rowStyle: React.CSSProperties = {}

              if (isDone) {
                badgeStyle = { background: '#f0fdf4', color: 'var(--success)' }
                badgeText = 'Done'
                rowStyle = { opacity: 0.6 }
              } else if (isCurrent) {
                badgeStyle = { background: 'var(--primary-light)', color: 'var(--primary)' }
                badgeText = 'Up next'
                rowStyle = { borderLeft: '3px solid var(--primary)', paddingLeft: 13 }
              } else {
                rowStyle = { opacity: 0.4 }
              }

              return (
                <div
                  key={s.type}
                  style={{
                    padding: '12px 16px',
                    border: '1px solid var(--border-light)',
                    borderRadius: 'var(--radius-sm)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    ...rowStyle,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 20 }}>{s.icon}</span>
                    <div>
                      <strong>{i + 1}. {s.label}</strong>
                      <span style={{ fontSize: 12, color: 'var(--text-light)', marginLeft: 8 }}>
                        {s.time}{score !== undefined ? ` \u2014 ${score}%` : ''}
                      </span>
                    </div>
                  </div>
                  <span className="badge" style={badgeStyle}>{badgeText}</span>
                </div>
              )
            })}
          </div>

          {fullExamState.currentSection < fullExamState.sections.length ? (
            <>
              <button className="btn btn-primary" style={{ width: '100%' }} onClick={startNextSection}>
                Start {fullExamState.sections[fullExamState.currentSection]?.label} ({fullExamState.sections[fullExamState.currentSection]?.time})
              </button>
              <button
                className="btn btn-danger"
                style={{ width: '100%', marginTop: 8 }}
                onClick={handleAbort}
              >
                Abort Full Exam
              </button>
            </>
          ) : (
            <button
              className="btn btn-primary"
              style={{ width: '100%' }}
              onClick={() => {
                const scores = Object.values(fullExamState.scores) as number[]
                const avg = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0
                window.alert(
                  `Full Exam Complete!\n\nAverage Score: ${avg}%\n\n` +
                  fullExamState.sections.map(s =>
                    `${s.label}: ${fullExamState.scores[s.type] !== undefined ? fullExamState.scores[s.type] + '%' : 'N/A'}`
                  ).join('\n')
                )
                abortExam()
              }}
            >
              Exam Complete! View Results
            </button>
          )}
        </div>
      )}

      {/* Section Cards */}
      <div className="yki-dashboard">
        <Link to="/yki/reading" className="yki-card">
          <div className="yki-card-icon">&#x1F4D6;</div>
          <h3>Reading</h3>
          <p>Comprehension of Swedish texts</p>
          <div className="yki-card-time">60 min</div>
        </Link>
        <Link to="/yki/writing" className="yki-card">
          <div className="yki-card-icon">&#x1F4DD;</div>
          <h3>Writing</h3>
          <p>Written production in Swedish</p>
          <div className="yki-card-time">54 min</div>
        </Link>
        <Link to="/yki/listening" className="yki-card">
          <div className="yki-card-icon">&#x1F3A7;</div>
          <h3>Listening</h3>
          <p>Comprehension of spoken Swedish</p>
          <div className="yki-card-time">40 min</div>
        </Link>
        <Link to="/yki/speaking" className="yki-card">
          <div className="yki-card-icon">&#x1F3A4;</div>
          <h3>Speaking</h3>
          <p>Oral production in Swedish</p>
          <div className="yki-card-time">25 min</div>
        </Link>
      </div>

      {/* Recent Results */}
      <h3 style={{ fontSize: 16, marginBottom: 12 }}>Recent Results</h3>
      {sessionsLoading ? (
        <p style={{ color: 'var(--text-light)' }}>Loading...</p>
      ) : sessions.length === 0 ? (
        <p className="empty-state">No exams taken yet.</p>
      ) : (
        <div>
          {sessions.map(s => (
            <div key={s.id} className="file-item">
              <div className="file-info">
                <span className="file-name">
                  {s.exam_type.charAt(0).toUpperCase() + s.exam_type.slice(1)} Exam
                </span>
                <span className="file-meta">
                  <span className="badge">{s.topic || 'General'}</span>
                  <span className="badge">{s.status}</span>
                  <span>{formatDate(s.started_at)}</span>
                  {s.total_score !== null && <span>{s.total_score}%</span>}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
