import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  fetchTests, fetchTopics, fetchTest, fetchRandom, fetchMix,
  fetchPractice, browseSpeaking, synthesizePrompt, getBeepUrl,
} from '../../api/speaking'
import { evaluateExam } from '../../api/yki'
import type {
  SpeakingTest, SpeakingResponse,
  SpeakingTestListItem, SpeakingBrowseItem,
  DialogueItem, ReactItem,
} from '../../types/exam'
import { useFullExam } from '../../context/FullExamContext'
import { playAudioTwice, playAudioOnce, fmtTime } from '../../utils/audio'
import { sleep } from '../../utils/sleep'
import '../../styles/yki.css'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type ViewPhase = 'menu' | 'loading' | 'exam' | 'results'
type MenuSub = 'none' | 'mock' | 'practice'

/** Phase of a single item flow */
type FlowPhase = 'listening' | 'preparing' | 'recording' | 'done' | 'idle'

interface ItemUI {
  headerText: string
  promptText: string
  instructionText: string
  bullets: string[] | null
  topicTitle: string | null
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function isDialogueItems(_items: unknown[], partType: string): _items is DialogueItem[] {
  return partType === 'dialogues'
}

function isReactItems(_items: unknown[], partType: string): _items is ReactItem[] {
  return partType === 'react'
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function SpeakingView() {
  const navigate = useNavigate()
  const { activeSection, completeSection } = useFullExam()
  const isFullExam = activeSection === 'speaking'

  /* ---- top-level view state ---- */
  const [phase, setPhase] = useState<ViewPhase>('menu')
  const [menuSub, setMenuSub] = useState<MenuSub>('none')

  /* ---- menu data ---- */
  const [testList, setTestList] = useState<SpeakingTestListItem[]>([])
  const [topicList, setTopicList] = useState<string[]>([])
  const [mockChoice, setMockChoice] = useState('random')
  const [practicePartType, setPracticePartType] = useState('')
  const [practiceTopic, setPracticeTopic] = useState('')
  const [browseItems, setBrowseItems] = useState<SpeakingBrowseItem[] | null>(null)
  const [showBrowser, setShowBrowser] = useState(false)

  /* ---- exam state ---- */
  const [testData, setTestData] = useState<SpeakingTest | null>(null)
  const [, setIsMock] = useState(false)
  const [examTitle, setExamTitle] = useState('Speaking Exam')
  const [partLabel, setPartLabel] = useState('')
  const allResponsesRef = useRef<SpeakingResponse[]>([])

  /* ---- single-item flow state ---- */
  const [flowPhase, setFlowPhase] = useState<FlowPhase>('idle')
  const [currentItem, setCurrentItem] = useState<ItemUI | null>(null)
  const [timerDisplay, setTimerDisplay] = useState('--:--')
  const [timerWarning, setTimerWarning] = useState<'' | 'warning' | 'danger'>('')
  const [liveTranscript, setLiveTranscript] = useState('')
  const [flowBg, setFlowBg] = useState('var(--bg)')

  /* ---- results state ---- */
  const [responses, setResponses] = useState<SpeakingResponse[]>([])
  const [score, setScore] = useState<number | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [evaluating, setEvaluating] = useState(false)

  /* ---- pending practice preview ---- */
  const [pendingPractice, setPendingPractice] = useState<{ data: SpeakingTest; title: string } | null>(null)
  const [pendingLoading, setPendingLoading] = useState(false)

  /* ---- refs for imperative engine ---- */
  const abortRef = useRef(false)
  const timerIdRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)
  /** stable ref to know if engine is running */
  const engineRunningRef = useRef(false)
  /** track active audio elements for cleanup on unmount */
  const activeAudiosRef = useRef<HTMLAudioElement[]>([])

  /* ================================================================ */
  /*  SpeechRecognition browser shim                                   */
  /* ================================================================ */

  type SpeechRecognitionInstance = {
    lang: string
    continuous: boolean
    interimResults: boolean
    onresult: ((ev: { results: SpeechRecognitionResultList }) => void) | null
    onerror: ((ev: Event) => void) | null
    onend: (() => void) | null
    start(): void
    stop(): void
    abort(): void
  }

  function getSpeechRecognition(): (new () => SpeechRecognitionInstance) | null {
    const w = window as unknown as Record<string, unknown>
    return (w['SpeechRecognition'] ?? w['webkitSpeechRecognition'] ?? null) as
      (new () => SpeechRecognitionInstance) | null
  }

  /* ================================================================ */
  /*  Load menu data                                                   */
  /* ================================================================ */

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [tests, topics] = await Promise.all([fetchTests(), fetchTopics()])
      if (cancelled) return
      setTestList(tests)
      setTopicList(topics)
    })()
    return () => { cancelled = true }
  }, [])

  /* ================================================================ */
  /*  Full exam auto-start                                             */
  /* ================================================================ */

  const fullExamStartedRef = useRef(false)
  useEffect(() => {
    if (isFullExam && !fullExamStartedRef.current && phase === 'menu') {
      fullExamStartedRef.current = true
      startMock('random')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFullExam, phase])

  /* ================================================================ */
  /*  Cleanup on unmount                                               */
  /* ================================================================ */

  useEffect(() => {
    return () => {
      abortRef.current = true
      stopAllResources()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ================================================================ */
  /*  Resource cleanup                                                 */
  /* ================================================================ */

  function stopAllResources() {
    if (timerIdRef.current) {
      clearInterval(timerIdRef.current)
      timerIdRef.current = null
    }
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try { recorderRef.current.stop() } catch { /* ignore */ }
    }
    recorderRef.current = null
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    chunksRef.current = []
    if (recognitionRef.current) {
      try { recognitionRef.current.stop() } catch { /* ignore */ }
      recognitionRef.current = null
    }
    // Stop all active audio elements
    activeAudiosRef.current.forEach(a => { try { a.pause(); a.src = '' } catch { /* ignore */ } })
    activeAudiosRef.current = []
  }

  /* ================================================================ */
  /*  Menu actions                                                     */
  /* ================================================================ */

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const startMock = useCallback(async (choice?: string) => {
    const sel = choice ?? mockChoice
    setPhase('loading')
    setIsMock(true)
    abortRef.current = false
    allResponsesRef.current = []

    try {
      let data: SpeakingTest
      if (sel === 'random') {
        data = await fetchRandom()
      } else if (sel === 'mix') {
        data = await fetchMix()
      } else {
        data = await fetchTest(Number(sel))
      }
      if (abortRef.current) return
      setTestData(data)
      setExamTitle(
        data.number
          ? `Prov ${data.number} \u2014 ${data.topic}`
          : `Mock Test \u2014 ${data.topic || 'Mixed'}`
      )
      setPhase('exam')
      runEngine(data, true)
    } catch (err) {
      if (abortRef.current) return
      alert(err instanceof Error ? err.message : 'Failed to load test')
      setPhase('menu')
    }
  }, [mockChoice]) // eslint-disable-line react-hooks/exhaustive-deps

  async function startPracticeRandom() {
    setPendingLoading(true)
    setPendingPractice(null)

    try {
      const partData = await fetchPractice(practicePartType || undefined, practiceTopic || undefined)
      const wrapped: SpeakingTest = {
        number: 0,
        topic: partData.test_topic || partData.topic || 'Practice',
        parts: [partData],
      }
      setPendingPractice({ data: wrapped, title: `Practice \u2014 ${partData.title || partData.topic || ''}` })
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to load practice')
    } finally {
      setPendingLoading(false)
    }
  }

  function selectBrowseItem(item: SpeakingBrowseItem) {
    const wrapped: SpeakingTest = {
      number: 0,
      topic: item.data.test_topic || item.topic || 'Practice',
      parts: [item.data],
    }
    setPendingPractice({ data: wrapped, title: `Practice \u2014 ${item.title}` })
    setShowBrowser(false)
  }

  function handleStartPendingPractice() {
    if (!pendingPractice) return
    setPhase('loading')
    setIsMock(false)
    abortRef.current = false
    allResponsesRef.current = []

    setTestData(pendingPractice.data)
    setExamTitle(pendingPractice.title)
    setPhase('exam')
    runEngine(pendingPractice.data, false)
    setPendingPractice(null)
  }

  async function handleBrowse() {
    setShowBrowser(true)
    setBrowseItems(null)
    const items = await browseSpeaking(practicePartType || undefined, practiceTopic || undefined)
    setBrowseItems(items)
  }

  /* ================================================================ */
  /*  AUTO-RUN ENGINE                                                  */
  /* ================================================================ */

  function runEngine(data: SpeakingTest, mock: boolean) {
    if (engineRunningRef.current) return
    engineRunningRef.current = true
    // Fire-and-forget async engine
    runAllParts(data, mock).finally(() => {
      engineRunningRef.current = false
    })
  }

  async function runAllParts(data: SpeakingTest, mock: boolean) {
    const parts = data.parts || []
    for (let pi = 0; pi < parts.length; pi++) {
      if (abortRef.current) return
      const part = parts[pi]
      if (!part) continue
      setPartLabel(`Del ${part.part || pi + 1}: ${part.title}`)

      if (part.type === 'dialogues' && part.items && isDialogueItems(part.items, part.type)) {
        for (const dialog of part.items) {
          if (abortRef.current) return

          // Play situation (listen-only)
          await runSingleItem({
            id: `d${pi}-sit`,
            promptText: dialog.situation,
            instructionText: '',
            prepSeconds: 0,
            answerSeconds: 0,
            listenOnly: true,
            headerText: dialog.title,
            bullets: null,
            topicTitle: null,
            isMockMode: mock,
          })

          // Each dialogue line
          for (let li = 0; li < dialog.lines.length; li++) {
            if (abortRef.current) return
            const line = dialog.lines[li]
            if (!line) continue
            await runSingleItem({
              id: `d${pi}-${li}`,
              promptText: line.prompt,
              instructionText: line.instruction,
              prepSeconds: part.prep_seconds || 15,
              answerSeconds: part.answer_seconds || 20,
              listenOnly: false,
              headerText: `${dialog.title} \u2014 Reply ${li + 1}/${dialog.lines.length}`,
              bullets: null,
              topicTitle: null,
              isMockMode: mock,
            })
          }
        }
      } else if (part.type === 'react' && part.items && isReactItems(part.items, part.type)) {
        for (let i = 0; i < part.items.length; i++) {
          if (abortRef.current) return
          const item = part.items[i]
          if (!item) continue
          await runSingleItem({
            id: `r${pi}-${i}`,
            promptText: item.situation,
            instructionText: item.instruction,
            prepSeconds: part.prep_seconds || 20,
            answerSeconds: part.answer_seconds || 30,
            listenOnly: false,
            headerText: '',
            bullets: null,
            topicTitle: null,
            isMockMode: mock,
          })
        }
      } else if (part.type === 'narrate' || part.type === 'opinion') {
        const promptParts = part.prompts || []
        const fullPrompt = (part.topic || '') + '. ' + promptParts.join('. ')
        await runSingleItem({
          id: `n${pi}`,
          promptText: fullPrompt,
          instructionText: promptParts.join('\n'),
          prepSeconds: part.prep_seconds || 60,
          answerSeconds: part.answer_seconds || 90,
          listenOnly: false,
          headerText: '',
          bullets: promptParts.length > 0 ? promptParts : null,
          topicTitle: part.topic || null,
          isMockMode: mock,
        })
      }
    }

    // All parts done
    if (!abortRef.current) {
      finishExam()
    }
  }

  /* ================================================================ */
  /*  SINGLE ITEM FLOW                                                 */
  /*  Listen (2x) -> Prep countdown -> Beep -> Record+Timer -> Stop    */
  /* ================================================================ */

  interface SingleItemOpts {
    id: string
    promptText: string
    instructionText: string
    prepSeconds: number
    answerSeconds: number
    listenOnly: boolean
    headerText: string
    bullets: string[] | null
    topicTitle: string | null
    isMockMode: boolean
  }

  async function runSingleItem(opts: SingleItemOpts) {
    const {
      id, promptText, instructionText, prepSeconds, answerSeconds,
      listenOnly, headerText, bullets, topicTitle, isMockMode,
    } = opts

    // 1. Render the item UI
    setCurrentItem({
      headerText: headerText || topicTitle || '',
      promptText,
      instructionText: (bullets && bullets.length > 0) ? '' : instructionText,
      bullets,
      topicTitle,
    })
    setFlowPhase('listening')
    setTimerDisplay('')
    setTimerWarning('')
    setLiveTranscript('Waiting...')
    setFlowBg(listenOnly ? '#eff6ff' : '#eff6ff')

    // STEP 1: Play prompt via TTS
    try {
      const data = await synthesizePrompt(promptText)
      if (abortRef.current) return
      if (listenOnly) {
        await playAudioOnce(data.url, activeAudiosRef)
      } else {
        await playAudioTwice(data.url, activeAudiosRef)
      }
    } catch {
      // TTS failure - continue anyway
    }
    if (abortRef.current) return

    // Listen-only: done after TTS
    if (listenOnly) {
      setFlowPhase('done')
      setLiveTranscript('Now the dialogue begins...')
      await sleep(1500)
      return
    }

    // STEP 2: Prep countdown
    setFlowPhase('preparing')
    setFlowBg('#fffbeb')
    setLiveTranscript('Preparing...')
    await countdown(prepSeconds)
    if (abortRef.current) return

    // STEP 3: Beep + start recording
    setFlowPhase('recording')
    setFlowBg('#fef2f2')
    setLiveTranscript('')

    // Play beep
    try {
      const beepUrl = getBeepUrl()
      const beepAudio = new Audio(beepUrl)
      activeAudiosRef.current.push(beepAudio)
      beepAudio.play().catch(() => { /* ignore */ })
      await new Promise<void>(resolve => {
        beepAudio.addEventListener('ended', () => {
          activeAudiosRef.current = activeAudiosRef.current.filter(a => a !== beepAudio)
          resolve()
        })
        setTimeout(() => {
          activeAudiosRef.current = activeAudiosRef.current.filter(a => a !== beepAudio)
          resolve()
        }, 2000)
      })
    } catch { /* ignore */ }
    if (abortRef.current) return

    // Start recording
    let transcript = ''
    let transcriptEl = '' // tracks what's shown in UI
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true })
      chunksRef.current = []
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm'
      const mr = new MediaRecorder(streamRef.current, { mimeType })
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      mr.start()
      recorderRef.current = mr
    } catch {
      setLiveTranscript('Mic error \u2014 try Chrome browser')
      await sleep(2000)
      return
    }

    // Start speech recognition
    const SRCtor = getSpeechRecognition()
    if (SRCtor) {
      const recog = new SRCtor()
      recog.lang = 'sv-SE'
      recog.continuous = true
      recog.interimResults = true
      recog.onresult = (event) => {
        let finalText = ''
        let interimText = ''
        for (let i = 0; i < event.results.length; i++) {
          const result = event.results[i]
          if (!result) continue
          const alt = result[0]
          if (!alt) continue
          if (result.isFinal) {
            finalText += alt.transcript + ' '
          } else {
            interimText += alt.transcript
          }
        }
        transcript = finalText
        transcriptEl = finalText + (interimText ? '...' + interimText : '')
        setLiveTranscript(transcriptEl)
      }
      recog.onerror = () => { /* ignore */ }
      recog.onend = () => {
        // Auto-restart if still recording
        if (recorderRef.current && recorderRef.current.state === 'recording') {
          try { recog.start() } catch { /* ignore */ }
        }
      }
      recognitionRef.current = recog
      try { recog.start() } catch { /* ignore */ }
    }

    // STEP 4: Answer countdown (synced with recording)
    await countdown(answerSeconds, (remaining) => {
      if (remaining <= 5) setFlowBg('#fef2f2')
    })

    // STEP 5: Auto-stop
    setFlowPhase('done')
    setFlowBg('var(--bg)')

    // Stop recognition
    if (recognitionRef.current) {
      try { recognitionRef.current.stop() } catch { /* ignore */ }
      recognitionRef.current = null
    }

    // Stop recorder
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      await new Promise<void>(resolve => {
        const mr = recorderRef.current
        if (!mr) { resolve(); return }
        mr.onstop = () => resolve()
        mr.stop()
      })
    }
    recorderRef.current = null

    // Release mic
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }

    // Save response (transcript only, no blob)
    const finalTranscript = transcript || transcriptEl || ''
    allResponsesRef.current.push({ id, transcript: finalTranscript })
    setLiveTranscript(finalTranscript || '(no speech detected)')

    // Brief pause
    await sleep(isMockMode ? 1500 : 2000)
  }

  /* ================================================================ */
  /*  Countdown helper                                                 */
  /* ================================================================ */

  function countdown(seconds: number, onTick?: (remaining: number) => void): Promise<void> {
    return new Promise<void>((resolve) => {
      let remaining = seconds
      setTimerDisplay(fmtTime(remaining))
      setTimerWarning('')

      timerIdRef.current = setInterval(() => {
        if (abortRef.current) {
          if (timerIdRef.current) clearInterval(timerIdRef.current)
          timerIdRef.current = null
          resolve()
          return
        }
        remaining--
        setTimerDisplay(fmtTime(remaining))

        if (remaining <= 5) {
          setTimerWarning('danger')
        } else if (remaining <= 10) {
          setTimerWarning('warning')
        }

        if (onTick) onTick(remaining)

        if (remaining <= 0) {
          if (timerIdRef.current) clearInterval(timerIdRef.current)
          timerIdRef.current = null
          resolve()
        }
      }, 1000)
    })
  }

  /* ================================================================ */
  /*  Finish / Results                                                 */
  /* ================================================================ */

  function finishExam() {
    setFlowPhase('idle')
    setCurrentItem(null)
    setResponses([...allResponsesRef.current])
    setPhase('results')
  }

  async function handleEvaluate() {
    if (!testData) return
    setEvaluating(true)
    try {
      const result = await evaluateExam(
        'speaking',
        allResponsesRef.current.map(r => ({ transcript: r.transcript })),
        testData,
      )
      setScore(result.score)
      setFeedback(result.feedback || 'No feedback available.')

      if (isFullExam && result.score != null) {
        setTimeout(() => completeSection(result.score), 2000)
      }
    } catch {
      setFeedback('Evaluation failed. Please try again.')
    } finally {
      setEvaluating(false)
    }
  }

  /* ================================================================ */
  /*  Exit / Back                                                      */
  /* ================================================================ */

  function handleExit() {
    abortRef.current = true
    stopAllResources()
    engineRunningRef.current = false
    setFlowPhase('idle')
    setCurrentItem(null)
    setPhase('menu')
  }

  function handleBackFromResults() {
    setScore(null)
    setFeedback(null)
    setResponses([])
    allResponsesRef.current = []
    setPhase('menu')
  }

  /* ================================================================ */
  /*  Browse grouping                                                  */
  /* ================================================================ */

  function groupBrowseItems(items: SpeakingBrowseItem[]): Record<string, SpeakingBrowseItem[]> {
    const grouped: Record<string, SpeakingBrowseItem[]> = {}
    for (const item of items) {
      const key = `Prov ${item.test} \u2014 ${item.topic}`
      if (!grouped[key]) grouped[key] = []
      grouped[key].push(item)
    }
    return grouped
  }

  /* ================================================================ */
  /*  RENDER                                                           */
  /* ================================================================ */

  /* ---- Loading ---- */
  if (phase === 'loading') {
    return (
      <div id="yki-speaking">
        <div className="generating-overlay">
          <h3>Preparing audio...</h3>
          <p>Converting prompts to speech</p>
        </div>
      </div>
    )
  }

  /* ---- Results ---- */
  if (phase === 'results') {
    return (
      <div id="yki-speaking">
        <div className="results-panel">
          <div className="score-display">
            <div className="score-number">{score != null ? `${score}%` : '-'}</div>
            <div className="score-label">Your responses are saved below</div>
          </div>

          <div>
            {responses.length === 0 ? (
              <p className="empty-state">No responses recorded.</p>
            ) : (
              responses.map((r, i) => (
                <div
                  key={r.id}
                  style={{
                    padding: 12,
                    background: 'var(--bg)',
                    borderRadius: 'var(--radius-sm)',
                    marginBottom: 8,
                  }}
                >
                  <strong>Response {i + 1}</strong>
                  <p style={{ marginTop: 4, fontSize: 13, color: 'var(--text-dim)' }}>
                    {r.transcript || '(no transcript)'}
                  </p>
                </div>
              ))
            )}
          </div>

          {feedback && (
            <div className="feedback-text" style={{ marginTop: 16 }}>
              {feedback}
            </div>
          )}
        </div>

        <div style={{ marginTop: 16, display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button
            className="btn"
            onClick={handleEvaluate}
            disabled={evaluating}
          >
            {evaluating ? 'Evaluating...' : 'Get AI Feedback'}
          </button>
          {!isFullExam && (
            <button className="btn" onClick={handleBackFromResults}>
              Back
            </button>
          )}
        </div>
      </div>
    )
  }

  /* ---- Exam (active engine) ---- */
  if (phase === 'exam') {
    return (
      <div id="yki-speaking">
        <div className="exam-header">
          <h2>{examTitle}</h2>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>{partLabel}</span>
          </div>
        </div>

        {/* Current item */}
        <div>
          {currentItem && (
            <div className="speaking-part">
              {currentItem.headerText && (
                <h3 style={{ marginBottom: 8 }}>{currentItem.headerText}</h3>
              )}

              <div
                className="speaking-prompt"
                style={{ borderLeft: '3px solid var(--primary)', paddingLeft: 16 }}
              >
                <p style={{ fontSize: 15, lineHeight: 1.7 }}>{currentItem.promptText}</p>
              </div>

              {/* Bullets for narrate/opinion */}
              {currentItem.bullets && currentItem.bullets.length > 0 && (
                <div style={{
                  marginTop: 12,
                  padding: 12,
                  background: 'var(--bg)',
                  borderRadius: 'var(--radius-sm)',
                }}>
                  <p style={{ fontSize: 12, color: 'var(--text-light)', marginBottom: 6 }}>
                    Questions to answer:
                  </p>
                  <ul style={{ margin: 0, paddingLeft: 20 }}>
                    {currentItem.bullets.map((b, i) => (
                      <li key={i} style={{ marginBottom: 4, fontSize: 14 }}>{b}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Instruction for dialogues/react */}
              {currentItem.instructionText && !currentItem.bullets && (
                <div style={{
                  marginTop: 8,
                  padding: '10px 12px',
                  background: '#fffbeb',
                  borderRadius: 'var(--radius-sm)',
                  borderLeft: '3px solid #d97706',
                }}>
                  <p style={{ fontSize: 13, color: '#92400e' }}>
                    <strong>Your task:</strong> {currentItem.instructionText}
                  </p>
                </div>
              )}

              {/* Flow status */}
              <div
                style={{
                  marginTop: 16,
                  padding: 16,
                  borderRadius: 'var(--radius-sm)',
                  background: flowBg,
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--primary)', marginBottom: 8 }}>
                  {flowPhase === 'listening' && 'Listening...'}
                  {flowPhase === 'preparing' && 'Prepare your answer...'}
                  {flowPhase === 'recording' && 'Svara nu! (Answer now)'}
                  {flowPhase === 'done' && "Time's up!"}
                  {flowPhase === 'idle' && ''}
                </div>
                <div
                  className={`exam-timer${timerWarning === 'warning' ? ' timer-warning' : ''}${timerWarning === 'danger' ? ' timer-danger' : ''}`}
                  style={{ fontSize: 32 }}
                >
                  {timerDisplay}
                </div>
              </div>

              {/* Transcript */}
              <div className="transcript-box" style={{ marginTop: 12 }}>
                {liveTranscript || 'Waiting...'}
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button className="btn" onClick={handleExit}>Exit</button>
        </div>
      </div>
    )
  }

  /* ---- Menu ---- */
  return (
    <div id="yki-speaking">
      <h2 style={{ fontSize: 22, marginBottom: 4 }}>Speaking Exam</h2>
      <p style={{ color: 'var(--text-dim)', fontSize: 14, marginBottom: 24 }}>
        Talproduktion &mdash; Practice individual parts or take a full mock test.
      </p>

      <div className="yki-dashboard">
        <div
          className="yki-card"
          onClick={() => { setMenuSub('mock'); setShowBrowser(false); setPendingPractice(null) }}
          style={{ cursor: 'pointer' }}
        >
          <div className="yki-card-icon">{'\uD83C\uDF93'}</div>
          <h3>Mock Test</h3>
          <p>Full exam &mdash; 4 parts, all timed, just like the real YKI</p>
          <div className="yki-card-time">25-30 minutes</div>
          <div className="yki-card-cta">Start Mock Exam &rarr;</div>
        </div>

        <div
          className="yki-card"
          onClick={() => { setMenuSub('practice'); setShowBrowser(false); setPendingPractice(null) }}
          style={{ cursor: 'pointer' }}
        >
          <div className="yki-card-icon">{'\uD83C\uDFA7'}</div>
          <h3>Practice Mode</h3>
          <p>Pick a part type and topic &mdash; practice at your own pace</p>
          <div className="yki-card-time">Flexible</div>
          <div className="yki-card-cta">Start Practice &rarr;</div>
        </div>
      </div>

      {/* Mock options */}
      {menuSub === 'mock' && (
        <div className="panel" style={{ marginTop: 16 }}>
          <h2>Choose a Mock Test</h2>
          <div className="form-row">
            <div className="form-group">
              <label>Test</label>
              <select value={mockChoice} onChange={e => setMockChoice(e.target.value)}>
                <option value="random">Random (full exam)</option>
                <option value="mix">Random Mix (parts from different tests)</option>
                {testList.map(t => (
                  <option key={t.number} value={String(t.number)}>
                    Prov {t.number} &mdash; {t.topic}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <button className="btn btn-primary" onClick={() => startMock()}>
            Start Mock Test
          </button>
        </div>
      )}

      {/* Practice options */}
      {menuSub === 'practice' && (
        <div className="panel" style={{ marginTop: 16 }}>
          <h2>Practice Settings</h2>
          <div className="form-row">
            <div className="form-group">
              <label>Part Type</label>
              <select
                value={practicePartType}
                onChange={e => { setPracticePartType(e.target.value); setShowBrowser(false) }}
              >
                <option value="">All</option>
                <option value="dialogues">Del 1: Dialoger</option>
                <option value="react">Del 2: Reagera</option>
                <option value="narrate">Del 3: Ber&auml;tta</option>
                <option value="opinion">Del 4: Din &aring;sikt</option>
              </select>
            </div>
            <div className="form-group">
              <label>Topic</label>
              <select
                value={practiceTopic}
                onChange={e => { setPracticeTopic(e.target.value); setShowBrowser(false) }}
              >
                <option value="">All</option>
                {topicList.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button
              className="btn btn-primary"
              style={{ flex: 1 }}
              onClick={startPracticeRandom}
              disabled={pendingLoading}
            >
              {pendingLoading ? 'Loading...' : 'Random Question'}
            </button>
            <button
              className="btn"
              style={{ flex: 1 }}
              onClick={handleBrowse}
              disabled={pendingLoading}
            >
              Browse Questions
            </button>
          </div>

          {/* Pending practice preview */}
          {pendingPractice && !showBrowser && (
            <div style={{
              marginTop: 16, padding: 16, background: 'var(--bg)',
              borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
            }}>
              {pendingPractice.data.parts.map((part, i) => (
                <div key={i} style={{ marginBottom: i < pendingPractice.data.parts.length - 1 ? 12 : 0 }}>
                  <span className="badge" style={{ marginRight: 6 }}>
                    {part.type === 'dialogues' ? 'Del 1: Dialoger'
                      : part.type === 'react' ? 'Del 2: Reagera'
                      : part.type === 'narrate' ? 'Del 3: Beratta'
                      : part.type === 'opinion' ? 'Del 4: Din asikt'
                      : part.type}
                  </span>
                  <strong style={{ fontSize: 14 }}>{part.title}</strong>
                  {part.topic && (
                    <p style={{ fontSize: 12, color: 'var(--text-light)', marginTop: 4 }}>
                      Topic: {part.topic}
                    </p>
                  )}
                </div>
              ))}
              <button
                className="btn btn-primary"
                style={{ marginTop: 12, width: '100%' }}
                onClick={handleStartPendingPractice}
              >
                Start Practice
              </button>
            </div>
          )}

          {/* Question browser */}
          {showBrowser && (
            <div style={{ marginTop: 16, maxHeight: 400, overflowY: 'auto' }}>
              {browseItems === null ? (
                <p style={{ padding: 12, color: 'var(--text-light)' }}>
                  Loading questions...
                </p>
              ) : browseItems.length === 0 ? (
                <p className="empty-state">No questions found.</p>
              ) : (
                Object.entries(groupBrowseItems(browseItems)).map(([group, questions]) => (
                  <div key={group} style={{ marginBottom: 12 }}>
                    <div style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: 'var(--text-light)',
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                      padding: '4px 0',
                    }}>
                      {group}
                    </div>
                    {questions.map(q => (
                      <div
                        key={q.id}
                        onClick={() => selectBrowseItem(q)}
                        style={{
                          padding: '10px 12px',
                          border: '1px solid var(--border-light)',
                          borderRadius: 'var(--radius-sm)',
                          marginBottom: 4,
                          cursor: 'pointer',
                          transition: 'border-color 0.1s',
                        }}
                      >
                        <div style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}>
                          <div>
                            <span className="badge" style={{ marginRight: 6 }}>
                              {q.part_label}
                            </span>
                            <strong style={{ fontSize: 13 }}>{q.title}</strong>
                          </div>
                          <button className="btn btn-small" style={{ flexShrink: 0 }}>
                            Start
                          </button>
                        </div>
                        <p style={{ fontSize: 12, color: 'var(--text-light)', marginTop: 4 }}>
                          {q.preview}
                        </p>
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* Back to YKI dashboard */}
      {!isFullExam && (
        <div style={{ marginTop: 24 }}>
          <button className="btn" onClick={() => navigate('/yki')}>
            Back to YKI Dashboard
          </button>
        </div>
      )}
    </div>
  )
}
