import { useState, useEffect, useRef, useCallback } from 'react'
import { fetchVoices, fetchRecentFolders, synthesize, fetchFiles, deleteFile, getPlayUrl, browse } from '../../api/tts'
import type { Voice, RecentFolder, AudioFile, BrowseResult } from '../../types/api'
import { formatSize, formatDate } from '../../utils/format'

export default function TtsView() {
  const [text, setText] = useState('')
  const [voices, setVoices] = useState<Voice[]>([])
  const [selectedVoice, setSelectedVoice] = useState('')
  const [format, setFormat] = useState('wav')
  const [filename, setFilename] = useState('')
  const [recentFolders, setRecentFolders] = useState<RecentFolder[]>([])
  const [selectedSavePath, setSelectedSavePath] = useState('')
  const [showSaveOptions, setShowSaveOptions] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [listenUrl, setListenUrl] = useState<string | null>(null)
  const [result, setResult] = useState<{ filename: string; size: number; path: string; folder: string } | null>(null)
  const [files, setFiles] = useState<AudioFile[]>([])
  const [filterFolder, setFilterFolder] = useState('')

  // Browser modal
  const [showBrowser, setShowBrowser] = useState(false)
  const [browserData, setBrowserData] = useState<BrowseResult | null>(null)
  const [browserPath, setBrowserPath] = useState('')
  const [browserSelected, setBrowserSelected] = useState('')

  const listenAudioRef = useRef<HTMLAudioElement>(null)
  const resultAudioRef = useRef<HTMLAudioElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Load initial data
  useEffect(() => {
    const init = async () => {
      const [v, f] = await Promise.all([fetchVoices(), fetchRecentFolders()])
      setVoices(v)
      if (v.length > 0) setSelectedVoice(v[0]!.id)
      setRecentFolders(f)
      if (f.length > 0) setSelectedSavePath(f[0]!.path)
    }
    init()
  }, [])

  // Load files
  const loadFiles = useCallback(async () => {
    const f = await fetchFiles(filterFolder || undefined)
    setFiles(f)
  }, [filterFolder])

  useEffect(() => { loadFiles() }, [loadFiles])

  // Listen
  const handleListen = async () => {
    if (!text.trim()) { alert('Please enter some text.'); return }
    setIsListening(true)
    try {
      const data = await synthesize({ text, voice_id: selectedVoice, format: 'wav', save_path: '', filename: '' })
      const url = getPlayUrl(data.folder, data.filename)
      setListenUrl(url)
      const audio = listenAudioRef.current
      if (audio) {
        audio.src = url
        audio.onended = () => { deleteFile(data.folder, data.filename).catch(() => {}) }
        audio.play()
      }
    } catch (err) {
      alert('Error: ' + (err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setIsListening(false)
    }
  }

  // Save
  const handleSave = async () => {
    if (!text.trim()) { alert('Please enter some text.'); return }
    setIsSaving(true)
    try {
      const data = await synthesize({ text, voice_id: selectedVoice, format, save_path: selectedSavePath, filename: filename.trim() })
      setResult({ filename: data.filename, size: data.size, path: data.path, folder: data.folder })
      if (resultAudioRef.current) {
        resultAudioRef.current.src = getPlayUrl(data.folder, data.filename)
      }
      setFilename('')
      loadFiles()
    } catch (err) {
      alert('Error: ' + (err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setIsSaving(false)
    }
  }

  // Keyboard shortcut
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') handleListen()
  }

  // Browse folders
  const browseTo = async (path: string) => {
    try {
      const data = await browse(path || undefined)
      setBrowserData(data)
      setBrowserPath(data.current)
      setBrowserSelected(data.current)
    } catch { /* ignore */ }
  }

  const openBrowser = () => {
    setShowBrowser(true)
    browseTo(selectedSavePath || '')
  }

  const selectBrowserFolder = () => {
    setSelectedSavePath(browserSelected)
    setShowBrowser(false)
  }

  // File actions
  const handlePlay = (folder: string, name: string) => {
    const url = getPlayUrl(folder, name)
    setResult({ filename: name, size: 0, path: folder + '/' + name, folder })
    if (resultAudioRef.current) {
      resultAudioRef.current.src = url
      resultAudioRef.current.play()
    }
  }

  const handleDownload = (folder: string, name: string) => {
    const a = document.createElement('a')
    a.href = getPlayUrl(folder, name)
    a.download = name
    a.click()
  }

  const handleDelete = async (folder: string, name: string) => {
    if (!confirm(`Delete ${name}?`)) return
    await deleteFile(folder, name)
    loadFiles()
  }

  return (
    <>
      <section className="panel">
        <h2>Text to Speech</h2>

        <div className="form-group">
          <label htmlFor="tts-text">Text</label>
          <textarea
            ref={textareaRef}
            id="tts-text"
            rows={6}
            placeholder="Skriv din svenska text här..."
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <div className="char-count">{text.length} characters</div>
        </div>

        <div className="form-group">
          <label htmlFor="tts-voice">Voice</label>
          <select id="tts-voice" value={selectedVoice} onChange={e => setSelectedVoice(e.target.value)}>
            {voices.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </div>

        <div className="actions" style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-primary" style={{ flex: 1 }} disabled={isListening} onClick={handleListen}>
            {isListening ? 'Generating...' : 'Listen'}
          </button>
          <button className="btn" style={{ flexShrink: 0 }} onClick={() => setShowSaveOptions(!showSaveOptions)}>
            {showSaveOptions ? 'Hide Save Options \u2191' : 'Save to File \u2193'}
          </button>
        </div>

        {listenUrl && (
          <div style={{ marginTop: 16 }}>
            <audio ref={listenAudioRef} controls style={{ width: '100%' }} />
          </div>
        )}

        {showSaveOptions && (
          <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid var(--border-light)' }}>
            <div className="form-row">
              <div className="form-group">
                <label>Format</label>
                <select value={format} onChange={e => setFormat(e.target.value)}>
                  <option value="wav">WAV (lossless)</option>
                  <option value="mp3">MP3</option>
                  <option value="ogg">OGG Vorbis</option>
                  <option value="flac">FLAC</option>
                </select>
              </div>
              <div className="form-group">
                <label>Filename <span className="optional">(optional)</span></label>
                <input type="text" placeholder="Auto-generated if empty" value={filename} onChange={e => setFilename(e.target.value)} />
              </div>
            </div>

            <div className="form-group">
              <label>Save to</label>
              <div className="save-location">
                <select value={selectedSavePath} onChange={e => setSelectedSavePath(e.target.value)}>
                  {recentFolders.map(f => <option key={f.path} value={f.path}>{f.name}</option>)}
                </select>
                <span className="save-or">or</span>
                <button className="btn btn-small" onClick={openBrowser}>Browse...</button>
              </div>
              <div className="current-path">{selectedSavePath}</div>
            </div>

            <div className="actions">
              <button className="btn btn-primary" disabled={isSaving} onClick={handleSave}>
                {isSaving ? 'Saving...' : 'Save Speech to File'}
              </button>
            </div>
          </div>
        )}

        {result && (
          <div style={{ marginTop: 20 }}>
            <div className="result-card">
              <div className="result-info">
                <span className="result-name">{result.filename}</span>
                {result.size > 0 && <span className="result-size">{formatSize(result.size)}</span>}
              </div>
              <div className="result-path">{result.path}</div>
              <audio ref={resultAudioRef} controls />
            </div>
          </div>
        )}
      </section>

      <section className="panel">
        <div className="files-header">
          <h2>Saved Files</h2>
          <div className="filter-row">
            <select value={filterFolder} onChange={e => setFilterFolder(e.target.value)}>
              <option value="">All Folders</option>
              {recentFolders.map(f => <option key={f.path} value={f.path}>{f.name}</option>)}
            </select>
          </div>
        </div>
        <div className="files-list">
          {files.length === 0 ? (
            <p className="empty-state">No files yet. Generate some speech!</p>
          ) : (
            files.map(f => (
              <div key={f.folder + '/' + f.name} className="file-item">
                <div className="file-info">
                  <span className="file-name">{f.name}</span>
                  <span className="file-meta">
                    <span className="badge">{f.folder_short}</span>
                    <span className={`badge format-${f.format}`}>{f.format.toUpperCase()}</span>
                    <span>{formatSize(f.size)}</span>
                    <span>{formatDate(f.created)}</span>
                  </span>
                </div>
                <div className="file-actions">
                  <button className="btn btn-small" onClick={() => handlePlay(f.folder, f.name)}>Play</button>
                  <button className="btn btn-small" onClick={() => handleDownload(f.folder, f.name)}>Download</button>
                  <button className="btn btn-small btn-danger" onClick={() => handleDelete(f.folder, f.name)}>Delete</button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Folder Browser Modal */}
      {showBrowser && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowBrowser(false) }}>
          <div className="modal modal-browser">
            <h3>Choose Save Folder</h3>
            <div className="browser-path-bar">
              <button
                className="btn btn-small"
                disabled={!browserData?.parent}
                onClick={() => browserData?.parent && browseTo(browserData.parent)}
              >&uarr;</button>
              <input
                type="text"
                className="browser-path-input"
                value={browserPath}
                onChange={e => setBrowserPath(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') browseTo(browserPath) }}
                placeholder="/path/to/folder"
              />
              <button className="btn btn-small" onClick={() => browseTo(browserPath)}>Go</button>
            </div>
            <div className="browser-list">
              {!browserData || browserData.directories.length === 0 ? (
                <p className="empty-state">No subfolders</p>
              ) : (
                browserData.directories.map(d => (
                  <div
                    key={d.path}
                    className={`browser-item${browserSelected === d.path ? ' selected' : ''}`}
                    onClick={() => { setBrowserSelected(d.path); setBrowserPath(d.path) }}
                    onDoubleClick={() => browseTo(d.path)}
                  >
                    <span className="folder-icon">{'\uD83D\uDCC1'}</span>
                    <span className="folder-name">{d.name}</span>
                  </div>
                ))
              )}
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={() => setShowBrowser(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={selectBrowserFolder}>Select This Folder</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
