import { useState, useCallback, useRef } from 'react'
import { fetchVoices, synthesize, deleteFile, getPlayUrl } from '../api/tts'

export function useTtsPlayback() {
  const [isPlaying, setIsPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const speak = useCallback(async (text: string) => {
    if (isPlaying) return
    setIsPlaying(true)
    try {
      const voices = await fetchVoices()
      if (voices.length === 0) return

      const data = await synthesize({
        text,
        voice_id: voices[0]!.id,
        format: 'wav',
        save_path: '',
        filename: '',
      })

      const audio = new Audio(getPlayUrl(data.folder, data.filename))
      audioRef.current = audio
      audio.addEventListener('ended', () => {
        deleteFile(data.folder, data.filename).catch(() => {})
        setIsPlaying(false)
        audioRef.current = null
      })
      audio.addEventListener('error', () => {
        setIsPlaying(false)
        audioRef.current = null
      })
      await audio.play()
    } catch {
      setIsPlaying(false)
    }
  }, [isPlaying])

  return { speak, isPlaying }
}
