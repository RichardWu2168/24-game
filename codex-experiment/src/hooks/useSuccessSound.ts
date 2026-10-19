import { useEffect, useRef, useState } from 'react';

export function useSuccessSound() {
  const [enabled, setEnabled] = useState(true);
  const active = useRef<AudioContext | null>(null);

  function stop() {
    const context = active.current;
    active.current = null;
    if (context && context.state !== 'closed') void context.close().catch(() => {});
  }

  useEffect(() => stop, []);

  function toggle() {
    if (enabled) stop();
    setEnabled(!enabled);
  }

  function play() {
    if (!enabled || typeof AudioContext === 'undefined') return;
    stop();
    try {
      const context = new AudioContext();
      active.current = context;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = context.currentTime;
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(660, start);
      oscillator.frequency.setValueAtTime(880, start + 0.14);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.12, start + 0.02);
      gain.gain.linearRampToValueAtTime(0, start + 0.4);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.onended = () => { if (active.current === context) stop(); };
      oscillator.start(start);
      oscillator.stop(start + 0.4);
      void context.resume().catch(() => { if (active.current === context) stop(); });
    } catch {
      // Audio may be unavailable; answer feedback must still work.
      stop();
    }
  }

  return { enabled, toggle, play };
}
