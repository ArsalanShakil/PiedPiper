import { useState, useRef, useCallback, useEffect } from 'react'
import { fmtTime } from '../utils/audio'

interface UseTimerOptions {
  onTick?: (remaining: number) => void
  onExpire?: () => void
  autoStart?: boolean
}

export function useTimer(totalSeconds: number, options?: UseTimerOptions) {
  const [remaining, setRemaining] = useState(totalSeconds)
  const [isRunning, setIsRunning] = useState(options?.autoStart ?? false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const optionsRef = useRef(options)
  optionsRef.current = options

  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    setIsRunning(false)
  }, [])

  const start = useCallback(() => {
    stop()
    setIsRunning(true)
    intervalRef.current = setInterval(() => {
      setRemaining(prev => {
        const next = prev - 1
        optionsRef.current?.onTick?.(next)
        if (next <= 0) {
          if (intervalRef.current) clearInterval(intervalRef.current)
          intervalRef.current = null
          setIsRunning(false)
          optionsRef.current?.onExpire?.()
          return 0
        }
        return next
      })
    }, 1000)
  }, [stop])

  const reset = useCallback((newTotal?: number) => {
    stop()
    setRemaining(newTotal ?? totalSeconds)
  }, [stop, totalSeconds])

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  const timerClass = remaining <= 60 ? 'timer-danger' : remaining <= 300 ? 'timer-warning' : ''

  return {
    remaining,
    elapsed: totalSeconds - remaining,
    isRunning,
    display: fmtTime(remaining),
    timerClass,
    start,
    stop,
    reset,
  }
}
