/**
 * Audio notifications using the Web Audio API.
 * Synthesizes drum-like hits for interval transitions.
 */

let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

/**
 * Synthesize a drum hit by layering:
 *  - A short oscillator with a fast pitch sweep (the "body/thump")
 *  - A burst of filtered noise (the "snap/crack")
 */
function playDrumHit(
  startFreq: number = 180,
  endFreq: number = 40,
  noiseLevel: number = 0.35,
  bodyLevel: number = 0.6,
  durationMs: number = 120,
): void {
  try {
    const ctx = getCtx();
    const t = ctx.currentTime;
    const dur = durationMs / 1000;

    // ── Body (pitched oscillator with fast decay) ──
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(startFreq, t);
    osc.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
    oscGain.gain.setValueAtTime(bodyLevel, t);
    oscGain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(oscGain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur);

    // ── Noise layer (snare crack) ──
    const bufferSize = Math.floor(ctx.sampleRate * dur);
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1);
    }
    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = noiseBuffer;

    // Bandpass filter to shape the noise
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(3000, t);
    filter.Q.setValueAtTime(1.2, t);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(noiseLevel, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + dur * 0.6);

    noiseSrc.connect(filter).connect(noiseGain).connect(ctx.destination);
    noiseSrc.start(t);
    noiseSrc.stop(t + dur);
  } catch {
    // Audio not available
  }
}

/** Punchy drum roll for step transitions — 3 rapid hits. */
export function playStepBeep(): void {
  playDrumHit(220, 50, 0.5, 0.9, 150);
  setTimeout(() => playDrumHit(250, 55, 0.55, 0.95, 140), 150);
  setTimeout(() => playDrumHit(300, 60, 0.6, 1.0, 160), 300);
}

/** Big finish drum roll — 4 hits escalating in intensity. */
export function playCompleteBeep(): void {
  playDrumHit(200, 45, 0.45, 0.8, 140);
  setTimeout(() => playDrumHit(240, 50, 0.5, 0.9, 150), 180);
  setTimeout(() => playDrumHit(280, 55, 0.55, 0.95, 150), 360);
  setTimeout(() => playDrumHit(340, 65, 0.65, 1.0, 200), 540);
}
