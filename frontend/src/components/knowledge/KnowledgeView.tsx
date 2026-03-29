import { useState, useEffect, useRef } from 'react'
import { fetchFiles, previewFile, uploadFile, deleteFile } from '../../api/knowledge'
import type { KnowledgeFileMap } from '../../types/api'
import { formatSize } from '../../utils/format'
import '../../styles/knowledge.css'

const FOLDERS = ['Writing', 'Reading', 'Listening', 'Speaking']

function getFileIcon(ext: string) {
  switch (ext) {
    case '.md': return '\uD83D\uDCDD'
    case '.txt': return '\uD83D\uDCC4'
    case '.pdf': return '\uD83D\uDCD5'
    case '.docx': return '\uD83D\uDCD8'
    default: return '\uD83D\uDCC1'
  }
}

export default function KnowledgeView() {
  const [allFiles, setAllFiles] = useState<KnowledgeFileMap>({})
  const [activeFolder, setActiveFolder] = useState('Writing')
  const [uploadFolder, setUploadFolder] = useState('Writing')
  const [uploadStatus, setUploadStatus] = useState<{ message: string; type: string } | null>(null)
  const [preview, setPreview] = useState<{ title: string; content: string; truncated: boolean; fullSize: number } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadFiles = async () => {
    const data = await fetchFiles()
    setAllFiles(data)
  }

  useEffect(() => { loadFiles() }, [])

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadStatus({ message: `Uploading ${file.name} to ${uploadFolder}...`, type: 'uploading' })

    try {
      const data = await uploadFile(file, uploadFolder)
      setUploadStatus({ message: `Uploaded: ${data.name} to ${data.folder}`, type: 'success' })
      setActiveFolder(data.folder)
      loadFiles()
    } catch (err) {
      setUploadStatus({ message: err instanceof Error ? err.message : 'Upload failed', type: 'error' })
    }

    if (fileInputRef.current) fileInputRef.current.value = ''
    setTimeout(() => setUploadStatus(null), 3000)
  }

  const handlePreview = async (folder: string, name: string) => {
    setPreview({ title: `${folder} / ${name}`, content: 'Loading...', truncated: false, fullSize: 0 })
    try {
      const data = await previewFile(folder, name)
      let content = data.content
      if (data.truncated) {
        content += `\n\n--- (Showing first 5,000 of ${formatSize(data.full_size)} characters) ---`
      }
      setPreview({ title: `${folder} / ${name}`, content, truncated: data.truncated, fullSize: data.full_size })
    } catch {
      setPreview(prev => prev ? { ...prev, content: 'Error loading preview' } : null)
    }
  }

  const handleDelete = async (folder: string, name: string) => {
    if (!confirm(`Delete "${name}"?`)) return
    try {
      await deleteFile(folder, name)
      loadFiles()
      setPreview(null)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Delete failed')
    }
  }

  const files = allFiles[activeFolder] || []

  return (
    <div className="knowledge-page">
      <div className="page-header">
        <div>
          <h2>Knowledge Base</h2>
          <p className="page-description">Study materials used as context for AI-generated exams and evaluations.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select style={{ width: 130, fontSize: 13, padding: '6px 10px' }} value={uploadFolder} onChange={e => setUploadFolder(e.target.value)}>
            {FOLDERS.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
          <label className="btn btn-primary upload-btn">
            Upload File
            <input ref={fileInputRef} type="file" accept=".md,.txt,.pdf,.docx" style={{ display: 'none' }} onChange={handleUpload} />
          </label>
        </div>
      </div>

      {uploadStatus && (
        <div className={`upload-status ${uploadStatus.type}`}>{uploadStatus.message}</div>
      )}

      <div className="kb-tabs">
        {FOLDERS.map(f => (
          <button key={f} className={`kb-tab${activeFolder === f ? ' active' : ''}`} onClick={() => setActiveFolder(f)}>{f}</button>
        ))}
      </div>

      <div className="kb-layout">
        <div className="kb-file-list">
          {files.length === 0 ? (
            <p className="empty-state">No files in {activeFolder}. Upload some study materials!</p>
          ) : (
            files.map(f => (
              <div key={f.name} className="kb-file-item">
                <div className="kb-file-info" onClick={() => handlePreview(f.folder, f.name)} style={{ cursor: 'pointer' }}>
                  <span className="kb-file-icon">{getFileIcon(f.extension)}</span>
                  <div className="kb-file-details">
                    <span className="kb-file-name">{f.name}</span>
                    <span className="kb-file-meta">
                      {formatSize(f.size)}
                      {f.bundled
                        ? <span className="badge badge-bundled">Bundled</span>
                        : <span className="badge badge-uploaded">Uploaded</span>
                      }
                    </span>
                  </div>
                </div>
                <div className="kb-file-actions">
                  <button className="btn btn-small" onClick={() => handlePreview(f.folder, f.name)}>Preview</button>
                  {!f.bundled && (
                    <button className="btn btn-small btn-danger" onClick={() => handleDelete(f.folder, f.name)}>Delete</button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {preview && (
          <div className="kb-preview-panel">
            <div className="preview-header">
              <h3>{preview.title}</h3>
              <button className="btn btn-small" onClick={() => setPreview(null)}>Close</button>
            </div>
            <div className="preview-content">{preview.content}</div>
          </div>
        )}
      </div>
    </div>
  )
}
