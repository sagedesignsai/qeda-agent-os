/**
 * lib/celebration-audio.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Dependency-free synthesized celebratory audio built with the Web Audio API.
 *
 * Plays warm, harmonic bell chimes and level-up flourishes without external
 * audio files or network requests.
 * ─────────────────────────────────────────────────────────────────────────────
 */

class CelebrationAudioEngine {
  private ctx: AudioContext | null = null;

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  /**
   * Crisp, ethereal bell chime for task and step completions.
   * Plays a quick, warm harmonic chord (E5, G#5, B5, E6).
   */
  playCompletionChime(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const frequencies = [659.25, 830.61, 987.77, 1318.51]; // E major chord

    frequencies.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);

      // Stagger slightly for an arpeggiated sparkle
      const startAt = now + idx * 0.035;
      gain.gain.setValueAtTime(0, startAt);
      gain.gain.linearRampToValueAtTime(0.08, startAt + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.65);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startAt);
      osc.stop(startAt + 0.7);
    });
  }

  /**
   * Ascending celebration flourish for level-ups and milestones.
   */
  playLevelUpFanfare(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now);

      const startAt = now + idx * 0.08;
      gain.gain.setValueAtTime(0, startAt);
      gain.gain.linearRampToValueAtTime(0.12, startAt + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.9);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startAt);
      osc.stop(startAt + 0.95);
    });
  }
}

export const celebrationAudio = new CelebrationAudioEngine();
