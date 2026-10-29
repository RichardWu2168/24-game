export function playSuccessSound() {
  if (typeof AudioContext === 'undefined') return
  const audioContext = new AudioContext()
  const oscillator = audioContext.createOscillator()
  const gainNode = audioContext.createGain()

  oscillator.type = 'sine'
  oscillator.frequency.setValueAtTime(523.25, audioContext.currentTime)
  oscillator.frequency.setValueAtTime(659.25, audioContext.currentTime + 0.12)
  oscillator.frequency.setValueAtTime(783.99, audioContext.currentTime + 0.24)

  gainNode.gain.setValueAtTime(0.2, audioContext.currentTime)
  gainNode.gain.exponentialRampToValueAtTime(
    0.001,
    audioContext.currentTime + 0.5,
  )

  oscillator.connect(gainNode)
  gainNode.connect(audioContext.destination)

  oscillator.start()
  oscillator.stop(audioContext.currentTime + 0.5)

  oscillator.onended = () => {
    void audioContext.close().catch(() => {})
  }
}
