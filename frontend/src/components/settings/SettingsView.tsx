import { useState, useEffect } from 'react'
import { fetchVoices } from '../../api/tts'

export default function SettingsView() {
  const [voiceStatus, setVoiceStatus] = useState('Loading...')
  const [voiceOk, setVoiceOk] = useState(false)

  useEffect(() => {
    fetchVoices().then(voices => {
      if (voices.length > 0) {
        setVoiceStatus(voices.map(v => v.name).join(', '))
        setVoiceOk(true)
      } else {
        setVoiceStatus('No voice models found in ~/piper-voices/')
        setVoiceOk(false)
      }
    }).catch(() => {
      setVoiceStatus('Error checking voices')
    })
  }, [])

  return (
    <div style={{ maxWidth: 600 }}>
      <h2 style={{ fontSize: 22, marginBottom: 24 }}>Settings</h2>

      <div className="panel">
        <h2>Claude Code CLI</h2>
        <p style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 16 }}>
          AI features (translation, exam generation, evaluation) use your local Claude Code CLI.
        </p>
        <div style={{ padding: 12, borderRadius: 'var(--radius-sm)', background: 'var(--bg)', fontSize: 13 }}>
          <span style={{ color: 'var(--success)' }}>{'\u2713'}</span> Claude Code CLI will be used for AI features. Make sure <code>claude</code> is in your PATH.
        </div>
      </div>

      <div className="panel">
        <h2>Voice Model</h2>
        <p style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 16 }}>
          Swedish voice model used for text-to-speech.
        </p>
        <div style={{ padding: 12, borderRadius: 'var(--radius-sm)', background: 'var(--bg)', fontSize: 13 }}>
          <span style={{ color: voiceOk ? 'var(--success)' : 'var(--danger)' }}>{voiceOk ? '\u2713' : '\u2717'}</span> {voiceStatus}
        </div>
      </div>

      <div className="panel">
        <h2>About</h2>
        <p style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.7 }}>
          <strong>PiedPiper</strong> — Swedish Language Learning & YKI Prep<br />
          Powered by Piper TTS (open source) and Claude Code CLI.<br />
          All data stored locally on your machine.
        </p>
      </div>
    </div>
  )
}
