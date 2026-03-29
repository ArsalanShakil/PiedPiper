export function playAudioTwice(url: string): Promise<void> {
  return new Promise((resolve) => {
    const audio = new Audio(url)
    let count = 0
    audio.addEventListener('ended', () => {
      count++
      if (count < 2) {
        setTimeout(() => audio.play().catch(() => resolve()), 800)
      } else {
        resolve()
      }
    })
    audio.addEventListener('error', () => resolve())
    audio.play().catch(() => resolve())
  })
}

export function playAudioOnce(url: string): Promise<void> {
  return new Promise((resolve) => {
    const audio = new Audio(url)
    audio.addEventListener('ended', () => resolve())
    audio.addEventListener('error', () => resolve())
    audio.play().catch(() => resolve())
  })
}

export function fmtTime(seconds: number): string {
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}
