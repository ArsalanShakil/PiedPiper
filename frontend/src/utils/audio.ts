export function playAudioTwice(
  url: string,
  trackingRef?: { current: HTMLAudioElement[] },
): Promise<void> {
  return new Promise((resolve) => {
    const audio = new Audio(url)
    if (trackingRef) trackingRef.current.push(audio)
    const cleanup = () => {
      if (trackingRef) {
        trackingRef.current = trackingRef.current.filter(a => a !== audio)
      }
    }
    let count = 0
    audio.addEventListener('ended', () => {
      count++
      if (count < 2) {
        setTimeout(() => audio.play().catch(() => { cleanup(); resolve() }), 800)
      } else {
        cleanup()
        resolve()
      }
    })
    audio.addEventListener('error', () => { cleanup(); resolve() })
    audio.play().catch(() => { cleanup(); resolve() })
  })
}

export function playAudioOnce(
  url: string,
  trackingRef?: { current: HTMLAudioElement[] },
): Promise<void> {
  return new Promise((resolve) => {
    const audio = new Audio(url)
    if (trackingRef) trackingRef.current.push(audio)
    const cleanup = () => {
      if (trackingRef) {
        trackingRef.current = trackingRef.current.filter(a => a !== audio)
      }
    }
    audio.addEventListener('ended', () => { cleanup(); resolve() })
    audio.addEventListener('error', () => { cleanup(); resolve() })
    audio.play().catch(() => { cleanup(); resolve() })
  })
}

export function fmtTime(seconds: number): string {
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}
