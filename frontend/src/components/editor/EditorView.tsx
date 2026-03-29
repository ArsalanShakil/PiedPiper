import { useState, useEffect, useRef, useCallback } from 'react'
import ReactQuill from 'react-quill-new'
import 'react-quill-new/dist/quill.snow.css'

import {
  fetchDocuments,
  createDocument,
  fetchDocument,
  updateDocument,
  deleteDocument,
  fetchFolders,
  translate,
} from '../../api/editor'
import type { Document } from '../../types/api'
import { useVocab } from '../../context/VocabContext'
import { fetchVoices, synthesize, deleteFile, getPlayUrl } from '../../api/tts'
import { keepalivePut } from '../../api/client'
import { useLocalStorage } from '../../hooks/useLocalStorage'
import { useVocabHighlight } from '../../hooks/useVocabHighlight'
import { escapeHtml } from '../../utils/format'
import type { DocumentListItem, TranslationResult } from '../../types/api'
import '../../styles/editor.css'

const QUILL_MODULES = {
  toolbar: [
    ['bold', 'italic', 'underline'],
    [{ header: [1, 2, 3, false] }],
    [{ list: 'ordered' }, { list: 'bullet' }],
    ['clean'],
  ],
}

interface LastTranslation {
  swedish: string
  translation: string
  word_by_word: { sv?: string; en?: string; src?: string; dst?: string }[]
  grammar_notes: string
}

export default function EditorView() {
  // --- Refs for unmount save (must use refs, not state) ---
  const currentDocIdRef = useRef<number | null>(null)
  const isDirtyRef = useRef(false)
  const isLoadingRef = useRef(false)
  const isSavingRef = useRef(false)
  const titleRef = useRef('Untitled')
  const folderValRef = useRef('General')
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // --- State ---
  const [docs, setDocs] = useState<DocumentListItem[]>([])
  const [folders, setFolders] = useState<string[]>(['General'])
  const [currentDocId, setCurrentDocId] = useState<number | null>(null)
  const [title, setTitle] = useState('Untitled')
  const [folderVal, setFolderVal] = useState('General')
  const [folderFilter, setFolderFilter] = useState('')
  const [wordCount, setWordCount] = useState(0)
  const [saveStatus, setSaveStatus] = useState<{ text: string; color: string }>({ text: 'Saved', color: 'var(--success)' })
  const [transOpen, setTransOpen] = useState(false)
  const [transBody, setTransBody] = useState('<p class="trans-loading">Select text and click Translate</p>')
  const [transActionsVisible, setTransActionsVisible] = useState(false)
  const [selToolbarVisible, setSelToolbarVisible] = useState(false)
  const [selToolbarPos, setSelToolbarPos] = useState({ top: 0, left: 0 })
  const [tooltipState, setTooltipState] = useState<{ visible: boolean; text: string; top: number; left: number }>({
    visible: false, text: '', top: 0, left: 0,
  })
  const [addedWords, setAddedWords] = useState<Set<string>>(new Set())
  const [selectionInVocab, setSelectionInVocab] = useState(false)
  const [speakUrl, setSpeakUrl] = useState<string | null>(null)
  const [speakFile, setSpeakFile] = useState<{ folder: string; name: string } | null>(null)
  const [speakLoading, setSpeakLoading] = useState(false)
  const speakAudioRef = useRef<HTMLAudioElement>(null)
  const speakFileRef = useRef<{ folder: string; name: string } | null>(null)

  const [lastDocId, setLastDocId] = useLocalStorage<number | null>('piedpiper_last_doc_id', null)
  const lastTransRef = useRef<LastTranslation | null>(null)

  const quillRef = useRef<ReactQuill>(null)
  const editorContainerRef = useRef<HTMLDivElement>(null)
  const selToolbarRef = useRef<HTMLDivElement>(null)

  const { refreshHighlights } = useVocabHighlight(editorContainerRef)
  const vocab = useVocab()
  const vocabRef = useRef(vocab)
  vocabRef.current = vocab

  // Keep refs in sync with state
  useEffect(() => { currentDocIdRef.current = currentDocId }, [currentDocId])
  useEffect(() => { titleRef.current = title }, [title])
  useEffect(() => { folderValRef.current = folderVal }, [folderVal])

  // --- Quill text → word count + auto-save trigger ---
  const handleTextChange = useCallback((_value: string, _delta: unknown, source: string) => {
    const editor = quillRef.current?.getEditor()
    if (!editor) return
    const text = editor.getText().trim()
    const words = text ? text.split(/\s+/).length : 0
    setWordCount(words)

    if (source === 'user' && !isLoadingRef.current) {
      isDirtyRef.current = true
      scheduleSave()
    }

    // Refresh vocab highlights on every text change
    refreshHighlights()
  }, [refreshHighlights])

  // --- Title change ---
  const handleTitleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setTitle(e.target.value)
    if (!isLoadingRef.current) {
      isDirtyRef.current = true
      scheduleSave()
    }
  }, [])

  // --- Save logic ---
  function scheduleSave() {
    setSaveStatus({ text: 'Saving...', color: 'var(--text-light)' })
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(saveNow, 600)
  }

  async function saveNow() {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    if (!currentDocIdRef.current || isSavingRef.current || isLoadingRef.current) return
    isSavingRef.current = true
    await saveDocument()
    isDirtyRef.current = false
    setSaveStatus({ text: 'Auto-saved', color: 'var(--success)' })
    isSavingRef.current = false
    loadDocList()
  }

  async function saveDocument() {
    const docId = currentDocIdRef.current
    if (!docId) return
    const editor = quillRef.current?.getEditor()
    if (!editor) return
    const folder = (folderValRef.current && folderValRef.current !== '__new__') ? folderValRef.current : 'General'
    const html = editor.root.innerHTML
    const text = editor.getText().trim()
    const result = await updateDocument(docId, {
      title: titleRef.current.trim() || 'Untitled',
      folder,
      content_html: html,
      content_text: text,
    })
    // Update cache with latest content
    docCacheRef.current.set(docId, result)
    setLastDocId(docId)
  }

  // --- Save on unmount via keepalive ---
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      const docId = currentDocIdRef.current
      if (docId && isDirtyRef.current) {
        const editor = quillRef.current?.getEditor()
        if (editor) {
          const text = editor.getText().trim()
          // Safety: don't overwrite content with empty
          if (text.length > 0) {
            const folder = (folderValRef.current && folderValRef.current !== '__new__') ? folderValRef.current : 'General'
            keepalivePut(`/api/editor/documents/${docId}`, {
              title: titleRef.current.trim() || 'Untitled',
              folder,
              content_html: editor.root.innerHTML,
              content_text: text,
            })
          }
        }
      }
      if (currentDocIdRef.current) {
        localStorage.setItem('piedpiper_last_doc_id', JSON.stringify(currentDocIdRef.current))
      }
      // Clean up speak audio file
      if (speakFileRef.current) {
        deleteFile(speakFileRef.current.folder, speakFileRef.current.name).catch(() => {})
      }
    }
  }, [])

  // --- Document cache for fast switching ---
  const docCacheRef = useRef<Map<number, Document>>(new Map())

  const loadDoc = useCallback(async (id: number) => {
    isLoadingRef.current = true
    isDirtyRef.current = false
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)

    // Show cached version instantly if available
    const cached = docCacheRef.current.get(id)
    if (cached) {
      setCurrentDocId(cached.id)
      setLastDocId(cached.id)
      setTitle(cached.title)
      setFolderVal(cached.folder || 'General')
      const editor = quillRef.current?.getEditor()
      if (editor) {
        if (cached.content_html) {
          editor.root.innerHTML = cached.content_html
        } else {
          editor.setText('')
        }
      }
      setWordCount(cached.word_count || 0)
      setSaveStatus({ text: 'Saved', color: 'var(--success)' })
      isLoadingRef.current = false
      refreshHighlights()
    }

    try {
      const doc = await fetchDocument(id)
      docCacheRef.current.set(id, doc)
      // Only update UI if this is still the current doc (user didn't switch again)
      if (!cached || currentDocIdRef.current === id) {
        setCurrentDocId(doc.id)
        setLastDocId(doc.id)
        setTitle(doc.title)
        setFolderVal(doc.folder || 'General')
        const editor = quillRef.current?.getEditor()
        if (editor) {
          if (doc.content_html) {
            editor.root.innerHTML = doc.content_html
          } else {
            editor.setText('')
          }
        }
        setWordCount(doc.word_count || 0)
        setSaveStatus({ text: 'Saved', color: 'var(--success)' })
        refreshHighlights()
      }
      isLoadingRef.current = false
    } catch {
      isLoadingRef.current = false
    }
  }, [refreshHighlights, setLastDocId])

  // --- Doc list ---
  const loadDocList = useCallback(async () => {
    try {
      const list = await fetchDocuments()
      setDocs(list)
    } catch {
      // silently fail
    }
  }, [])

  // --- Folders ---
  const loadFolderList = useCallback(async (selectVal?: string) => {
    try {
      const fl = await fetchFolders()
      setFolders(fl)
      if (selectVal) setFolderVal(selectVal)
    } catch {
      // silently fail
    }
  }, [])

  // --- Init ---
  useEffect(() => {
    let cancelled = false
    async function init() {
      await loadFolderList('General')

      let list: DocumentListItem[] = []
      try {
        list = await fetchDocuments()
        if (cancelled) return
        setDocs(list)
      } catch {
        return
      }

      let docId: number | null = null
      if (list.length === 0) {
        try {
          const newDoc = await createDocument('My first document', 'General')
          docId = newDoc.id
          list = await fetchDocuments()
          if (cancelled) return
          setDocs(list)
        } catch {
          return
        }
      } else {
        const restored = lastDocId ? list.find(d => d.id === lastDocId) : null
        docId = restored ? restored.id : list[0]?.id ?? null
      }

      if (docId && !cancelled) {
        await loadDoc(docId)
      }
    }
    init()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // --- Folder change handler ---
  const handleFolderChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value
    if (val === '__new__') {
      const name = prompt('New folder name:')
      if (name && name.trim()) {
        const trimmed = name.trim()
        setFolders(prev => prev.includes(trimmed) ? prev : [...prev, trimmed])
        setFolderVal(trimmed)
        // Trigger save
        isDirtyRef.current = true
        scheduleSave()
      } else {
        // Reset to current
        setFolderVal(prev => prev)
      }
    } else {
      setFolderVal(val)
      isDirtyRef.current = true
      scheduleSave()
    }
  }, [])

  // --- New document ---
  const handleNewDoc = useCallback(async () => {
    if (currentDocIdRef.current && !isSavingRef.current) {
      await saveDocument()
    }
    isLoadingRef.current = true
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)

    const folder = (folderValRef.current && folderValRef.current !== '__new__') ? folderValRef.current : 'General'
    try {
      const newDoc = await createDocument('Untitled', folder)
      setCurrentDocId(newDoc.id)
      setLastDocId(newDoc.id)
      setTitle(newDoc.title)
      setFolderVal(newDoc.folder)

      const editor = quillRef.current?.getEditor()
      if (editor) editor.setText('')

      setTimeout(() => {
        isLoadingRef.current = false
        setSaveStatus({ text: 'Saved', color: 'var(--success)' })
      }, 100)

      loadDocList()
    } catch {
      isLoadingRef.current = false
    }
  }, [loadDocList, setLastDocId])

  // --- Delete document ---
  const handleDeleteDoc = useCallback(async (id: number) => {
    if (!confirm('Delete this document?')) return
    try {
      await deleteDocument(id)
      if (currentDocIdRef.current === id) {
        setCurrentDocId(null)
        currentDocIdRef.current = null
        localStorage.removeItem('piedpiper_last_doc_id')
        setTitle('Untitled')
        const editor = quillRef.current?.getEditor()
        if (editor) editor.setText('')
      }
      loadDocList()
    } catch {
      // fail silently
    }
  }, [loadDocList])

  // --- Delete folder ---
  const handleDeleteFolder = useCallback(async (folder: string) => {
    if (!confirm(`Delete folder "${folder}"? Documents will be moved to General.`)) return
    try {
      const allDocs = await fetchDocuments()
      for (const d of allDocs.filter(doc => doc.folder === folder)) {
        await updateDocument(d.id, { folder: 'General' })
      }
      if (folderValRef.current === folder) setFolderVal('General')
      await loadFolderList(folderValRef.current === folder ? 'General' : folderValRef.current)
      loadDocList()
    } catch {
      // fail silently
    }
  }, [loadDocList, loadFolderList])

  // --- Selection toolbar (mouseup/keyup) ---
  useEffect(() => {
    function handleSelection() {
      const sel = window.getSelection()
      if (!sel) return
      const text = sel.toString().trim()
      if (!text || text.length < 2) {
        setSelToolbarVisible(false)
        return
      }

      const editorEl = editorContainerRef.current?.querySelector('.ql-editor')
      if (!editorEl || !sel.anchorNode || !editorEl.contains(sel.anchorNode)) {
        setSelToolbarVisible(false)
        return
      }

      const range = sel.getRangeAt(0)
      const rect = range.getBoundingClientRect()
      setSelToolbarPos({
        top: rect.top + window.scrollY - 44,
        left: rect.left + window.scrollX + rect.width / 2 - 80,
      })
      // Check if selected word is already in vocab
      setSelectionInVocab(vocabRef.current.isInVocab(text))
      setSelToolbarVisible(true)
    }

    function handleMouseDown(e: MouseEvent) {
      const toolbar = selToolbarRef.current
      if (toolbar && !toolbar.contains(e.target as Node)) {
        setSelToolbarVisible(false)
      }
    }

    document.addEventListener('mouseup', handleSelection)
    document.addEventListener('keyup', handleSelection)
    document.addEventListener('mousedown', handleMouseDown)
    return () => {
      document.removeEventListener('mouseup', handleSelection)
      document.removeEventListener('keyup', handleSelection)
      document.removeEventListener('mousedown', handleMouseDown)
    }
  }, [])

  // --- Vocab tooltip on mousemove ---
  useEffect(() => {
    function handleMouseMove(e: MouseEvent) {
      const target = e.target as HTMLElement
      if (!target.closest || !target.closest('.ql-editor')) {
        setTooltipState(prev => prev.visible ? { ...prev, visible: false } : prev)
        return
      }

      let word = ''
      if (document.caretPositionFromPoint) {
        const pos = document.caretPositionFromPoint(e.clientX, e.clientY)
        if (pos && pos.offsetNode && pos.offsetNode.nodeType === 3) {
          const text = pos.offsetNode.textContent ?? ''
          const offset = pos.offset
          let start = offset
          let end = offset
          while (start > 0 && /[\wåäöÅÄÖ]/.test(text[start - 1] ?? '')) start--
          while (end < text.length && /[\wåäöÅÄÖ]/.test(text[end] ?? '')) end++
          word = text.slice(start, end).toLowerCase()
        }
      } else if (document.caretRangeFromPoint) {
        const range = document.caretRangeFromPoint(e.clientX, e.clientY)
        if (range && range.startContainer && range.startContainer.nodeType === 3) {
          const text = range.startContainer.textContent ?? ''
          const offset = range.startOffset
          let start = offset
          let end = offset
          while (start > 0 && /[\wåäöÅÄÖ]/.test(text[start - 1] ?? '')) start--
          while (end < text.length && /[\wåäöÅÄÖ]/.test(text[end] ?? '')) end++
          word = text.slice(start, end).toLowerCase()
        }
      }

      const translation = word ? vocabRef.current.getTranslation(word) : undefined
      if (word && translation) {
        setTooltipState({
          visible: true,
          text: translation,
          top: e.clientY + window.scrollY + 16,
          left: e.clientX + window.scrollX,
        })
      } else {
        setTooltipState(prev => prev.visible ? { ...prev, visible: false } : prev)
      }
    }

    document.addEventListener('mousemove', handleMouseMove)
    return () => document.removeEventListener('mousemove', handleMouseMove)
  }, [])

  // --- Speak helper ---
  async function speakText(text: string) {
    // Clean up previous speak file
    if (speakFile) {
      deleteFile(speakFile.folder, speakFile.name).catch(() => {})
    }
    setSpeakLoading(true)
    setSpeakUrl(null)
    try {
      const voices = await fetchVoices()
      if (voices.length === 0) { setSpeakLoading(false); return }
      const firstVoice = voices[0]
      if (!firstVoice) { setSpeakLoading(false); return }
      const data = await synthesize({
        text,
        voice_id: firstVoice.id,
        format: 'wav',
        save_path: '',
        filename: '',
      })
      const url = getPlayUrl(data.folder, data.filename)
      setSpeakUrl(url)
      setSpeakFile({ folder: data.folder, name: data.filename })
      speakFileRef.current = { folder: data.folder, name: data.filename }
      setSpeakLoading(false)
      // Auto-play once ready
      setTimeout(() => {
        speakAudioRef.current?.play()
      }, 100)
    } catch {
      setSpeakLoading(false)
    }
  }

  const handleSpeakSpeed = (speed: number) => {
    if (speakAudioRef.current) {
      speakAudioRef.current.playbackRate = speed
    }
  }

  const closeSpeakPlayer = () => {
    if (speakAudioRef.current) {
      speakAudioRef.current.pause()
    }
    if (speakFile) {
      deleteFile(speakFile.folder, speakFile.name).catch(() => {})
    }
    setSpeakUrl(null)
    setSpeakFile(null)
    speakFileRef.current = null
  }

  // --- Selection toolbar actions ---
  const handleTranslate = useCallback(async () => {
    const text = window.getSelection()?.toString().trim()
    if (!text) return

    setSelToolbarVisible(false)
    setTransOpen(true)
    setTransBody('<p class="trans-loading">Translating...</p>')
    setTransActionsVisible(false)
    setAddedWords(new Set())

    const editor = quillRef.current?.getEditor()
    const context = editor ? editor.getText().trim().substring(0, 500) : ''

    try {
      const data: TranslationResult = await translate(text, context)
      lastTransRef.current = { swedish: text, ...data }

      let html = `<div class="trans-original">"${escapeHtml(text)}"</div>`
      html += `<div class="trans-result">${escapeHtml(data.translation)}</div>`

      if (data.word_by_word && data.word_by_word.length > 0) {
        html += '<div class="trans-words"><h4>Word by word</h4>'
        data.word_by_word.forEach(w => {
          const srcWord = w.sv || w.src || ''
          const dstWord = w.en || w.dst || ''
          html += `<div class="word-pair">
            <span class="word-sv">${escapeHtml(srcWord)}</span>
            <span class="word-pair-right">
              <span class="word-en">${escapeHtml(dstWord)}</span>
              <button class="word-add-btn" data-sv="${escapeHtml(srcWord)}" data-en="${escapeHtml(dstWord)}" title="Add to vocabulary">+</button>
            </span>
          </div>`
        })
        html += '</div>'
      }
      if (data.grammar_notes) {
        html += `<div class="trans-grammar">${escapeHtml(data.grammar_notes)}</div>`
      }

      setTransBody(html)
      setTransActionsVisible(true)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Translation failed'
      setTransBody(`<p class="trans-loading">${escapeHtml(msg)}</p>`)
    }
  }, [])

  const handleSelSpeak = useCallback(() => {
    const text = window.getSelection()?.toString().trim()
    if (!text) return
    setSelToolbarVisible(false)
    speakText(text)
  }, [])

  const handleSelVocab = useCallback(async () => {
    const text = window.getSelection()?.toString().trim()
    if (!text) return
    setSelToolbarVisible(false)

    const last = lastTransRef.current
    if (last && last.swedish === text) {
      await saveVocabWord(text, last.translation)
      setSaveStatus({ text: 'Saved to vocabulary!', color: 'var(--primary)' })
      setTimeout(() => setSaveStatus({ text: 'Auto-saved', color: 'var(--success)' }), 2000)
    } else {
      setTransOpen(true)
      setTransBody('<p class="trans-loading">Translating &amp; saving...</p>')
      try {
        const data = await translate(text)
        lastTransRef.current = { swedish: text, ...data }
        await saveVocabWord(text, data.translation)
        setTransBody(`<p class="trans-loading">Saved "${escapeHtml(text)}" to vocabulary!</p>`)
        setTimeout(() => setTransOpen(false), 1500)
      } catch {
        setTransBody('<p class="trans-loading">Failed to translate</p>')
      }
    }
  }, [])

  const handleRemoveVocab = useCallback(async () => {
    const text = window.getSelection()?.toString().trim()
    if (!text) return
    setSelToolbarVisible(false)
    try {
      await vocabRef.current.removeWord(text)
      setSaveStatus({ text: 'Removed from vocabulary', color: 'var(--danger)' })
      setTimeout(() => setSaveStatus({ text: 'Auto-saved', color: 'var(--success)' }), 2000)
    } catch {
      // silently fail
    }
  }, [])

  async function saveVocabWord(swedish: string, translation: string) {
    const editor = quillRef.current?.getEditor()
    const context = editor ? editor.getText().trim().substring(0, 200) : ''
    try {
      await vocabRef.current.addWord(swedish, translation, context)
    } catch {
      // silently fail
    }
  }

  // --- Word-by-word add button clicks (via event delegation on trans body) ---
  const handleTransBodyClick = useCallback(async (e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    if (!target.classList.contains('word-add-btn') || target.classList.contains('word-added')) return

    const sv = target.getAttribute('data-sv')
    const en = target.getAttribute('data-en')
    if (!sv || !en) return

    await saveVocabWord(sv, en)
    setAddedWords(prev => new Set(prev).add(sv))
  }, [])

  // --- Trans panel actions ---
  const handleTransSaveVocab = useCallback(async () => {
    const last = lastTransRef.current
    if (!last) return
    await saveVocabWord(last.swedish, last.translation)
    setSaveStatus({ text: 'Saved to vocabulary!', color: 'var(--primary)' })
    setTimeout(() => setSaveStatus({ text: 'Auto-saved', color: 'var(--success)' }), 1500)
  }, [])

  const handleTransSpeak = useCallback(() => {
    const last = lastTransRef.current
    if (last) speakText(last.swedish)
  }, [])

  // --- Render doc list ---
  const filteredDocs = folderFilter ? docs.filter(d => d.folder === folderFilter) : docs
  const grouped: Record<string, DocumentListItem[]> = {}
  for (const d of filteredDocs) {
    const f = d.folder || 'General'
    if (!grouped[f]) grouped[f] = []
    grouped[f]!.push(d)
  }

  // Post-process trans body to mark added words
  let processedTransBody = transBody
  if (addedWords.size > 0) {
    addedWords.forEach(sv => {
      const escapedSv = escapeHtml(sv)
      processedTransBody = processedTransBody.replace(
        new RegExp(`(<button class="word-add-btn"[^>]*data-sv="${escapedSv.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>)\\+</button>`, 'g'),
        `$1</button>`,
      )
      processedTransBody = processedTransBody.replace(
        new RegExp(`(<button class="word-add-btn")([^>]*data-sv="${escapedSv.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>)`, 'g'),
        `$1 disabled class="word-add-btn word-added"$2`,
      )
    })
  }

  return (
    <div className="editor-layout">
      {/* Document Sidebar */}
      <div className="doc-sidebar">
        <div className="doc-sidebar-header">
          <h3>Documents</h3>
          <button className="btn btn-small" onClick={handleNewDoc}>+ New</button>
        </div>
        <div style={{ padding: 8 }}>
          <select
            value={folderFilter}
            onChange={e => setFolderFilter(e.target.value)}
            style={{ width: '100%', fontSize: 12, padding: '6px 8px' }}
          >
            <option value="">All Folders</option>
            {folders.map(f => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </div>
        <div className="doc-list">
          {filteredDocs.length === 0 ? (
            <p style={{ padding: 12, color: 'var(--text-light)', fontSize: 13 }}>No documents</p>
          ) : (
            Object.entries(grouped).map(([folder, folderDocs]) => (
              <div key={folder}>
                {!folderFilter && (
                  <div className="doc-folder-header">
                    <span>{folder}</span>
                    {folder !== 'General' && (
                      <button
                        className="folder-delete-btn"
                        title="Delete folder"
                        onClick={() => handleDeleteFolder(folder)}
                      >
                        &times;
                      </button>
                    )}
                  </div>
                )}
                {folderDocs.map(d => (
                  <div
                    key={d.id}
                    className={`doc-item${d.id === currentDocId ? ' active' : ''}`}
                    onClick={() => loadDoc(d.id)}
                  >
                    <span className="doc-item-name">{d.title}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span className="doc-item-meta">{d.word_count}w</span>
                      <button
                        className="doc-delete-btn"
                        title="Delete"
                        onClick={e => { e.stopPropagation(); handleDeleteDoc(d.id) }}
                      >
                        &times;
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Editor Main */}
      <div className="editor-main">
        <div className="editor-toolbar-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <input
              type="text"
              className="editor-title-input"
              placeholder="Document title..."
              value={title}
              onChange={handleTitleChange}
            />
            <select
              value={folderVal}
              onChange={handleFolderChange}
              style={{ width: 120, fontSize: 12, padding: '5px 8px' }}
            >
              {folders.map(f => (
                <option key={f} value={f}>{f}</option>
              ))}
              <option value="__new__">+ New folder...</option>
            </select>
          </div>
          <div className="editor-stats">
            <span>{wordCount} words</span>
            <span style={{ color: saveStatus.color }}>{saveStatus.text}</span>
          </div>
        </div>
        <div className="editor-body">
          <div className="editor-paper" ref={editorContainerRef}>
            <ReactQuill
              ref={quillRef}
              theme="snow"
              placeholder="Skriv din svenska text h&auml;r..."
              modules={QUILL_MODULES}
              onChange={handleTextChange}
            />
          </div>
        </div>
      </div>

      {/* Floating Selection Toolbar */}
      <div
        ref={selToolbarRef}
        className={`selection-toolbar${selToolbarVisible ? ' visible' : ''}`}
        style={{ top: selToolbarPos.top, left: selToolbarPos.left }}
      >
        <button className="sel-btn sel-primary" onClick={handleTranslate}>Translate</button>
        <button className="sel-btn" onClick={handleSelSpeak}>Speak</button>
        {selectionInVocab ? (
          <button className="sel-btn sel-danger" onClick={handleRemoveVocab}>- Vocab</button>
        ) : (
          <button className="sel-btn" onClick={handleSelVocab}>+ Vocab</button>
        )}
      </div>

      {/* Speak Player */}
      {(speakUrl || speakLoading) && (
        <div className="speak-player-bar">
          {speakLoading ? (
            <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>Generating audio...</span>
          ) : (
            <>
              <audio ref={speakAudioRef} src={speakUrl ?? undefined} controls style={{ flex: 1, height: 36 }} />
              <div className="speak-speed-controls">
                {[0.5, 0.75, 1, 1.25, 1.5].map(s => (
                  <button
                    key={s}
                    className="btn btn-small"
                    onClick={() => handleSpeakSpeed(s)}
                    title={`${s}x speed`}
                  >
                    {s}x
                  </button>
                ))}
              </div>
              <button className="btn btn-small btn-danger" onClick={closeSpeakPlayer} title="Close">&times;</button>
            </>
          )}
        </div>
      )}

      {/* Translation Panel */}
      <div className={`translation-panel${transOpen ? ' visible' : ''}`}>
        <div className="trans-header">
          <h3>Translation</h3>
          <button className="btn btn-small" onClick={() => setTransOpen(false)}>Close</button>
        </div>
        {/* eslint-disable-next-line react/no-danger */}
        <div
          className="trans-body"
          dangerouslySetInnerHTML={{ __html: processedTransBody }}
          onClick={handleTransBodyClick}
        />
        {transActionsVisible && (
          <div className="trans-actions">
            <button className="btn btn-small" onClick={handleTransSaveVocab}>Save to Vocabulary</button>
            <button className="btn btn-small" onClick={handleTransSpeak}>Speak</button>
          </div>
        )}
      </div>

      {/* Vocab Tooltip */}
      {tooltipState.visible && (
        <div
          className="vocab-tooltip"
          style={{
            display: 'block',
            top: tooltipState.top,
            left: tooltipState.left,
          }}
        >
          {tooltipState.text}
        </div>
      )}
    </div>
  )
}
