import { useState, useRef, useCallback } from 'react'

/**
 * MediaRecorder wrapper for speaking practice.
 * Manages mic stream, recording state, and returns audio blobs.
 */
export function useAudioRecorder() {
  const [isRecording, setIsRecording] = useState(false)
  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  const init = useCallback(async () => {
    if (streamRef.current) return
    streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true })
  }, [])

  const start = useCallback(() => {
    const stream = streamRef.current
    if (!stream) throw new Error('Call init() before start()')
    chunksRef.current = []
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm'
    const mr = new MediaRecorder(stream, { mimeType })
    mr.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }
    mr.start()
    recorderRef.current = mr
    setIsRecording(true)
  }, [])

  const stop = useCallback((): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const mr = recorderRef.current
      if (!mr || mr.state === 'inactive') {
        reject(new Error('Not recording'))
        return
      }
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mr.mimeType })
        setIsRecording(false)
        recorderRef.current = null
        resolve(blob)
      }
      mr.stop()
    })
  }, [])

  const destroy = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try { recorderRef.current.stop() } catch { /* ignore */ }
    }
    recorderRef.current = null
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    chunksRef.current = []
    setIsRecording(false)
  }, [])

  return { isRecording, init, start, stop, destroy }
}
