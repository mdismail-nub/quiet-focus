export type ChimeEvent = "focus-end" | "break-start" | "break-end";

export type ChimeTone = "gentle-bell" | "warm-harp" | "minimal-tone";

export const CHIME_TONES: { id: ChimeTone; label: string; description: string }[] = [
  { id: "gentle-bell", label: "Gentle bell", description: "Soft resonant chime" },
  { id: "warm-harp", label: "Warm harp", description: "Calm plucked fifth" },
  { id: "minimal-tone", label: "Minimal", description: "Quiet two-note cue" },
];

export interface ChimeNote {
  freq: number;
  delaySec: number;
  durationSec: number;
  gainScale: number;
}

const CHIME_PATTERNS: Record<ChimeTone, Record<ChimeEvent, ChimeNote[]>> = {
  "gentle-bell": {
    "focus-end": [
      { freq: 523.25, delaySec: 0, durationSec: 0.85, gainScale: 0.85 }, // C5
      { freq: 659.25, delaySec: 0.16, durationSec: 0.95, gainScale: 0.95 }, // E5
      { freq: 783.99, delaySec: 0.34, durationSec: 1.25, gainScale: 1.0 }, // G5
    ],
    "break-start": [
      { freq: 587.33, delaySec: 0, durationSec: 0.75, gainScale: 0.8 }, // D5
      { freq: 440.0, delaySec: 0.2, durationSec: 1.05, gainScale: 0.75 }, // A4
    ],
    "break-end": [
      { freq: 523.25, delaySec: 0, durationSec: 0.7, gainScale: 0.85 }, // C5
      { freq: 659.25, delaySec: 0.18, durationSec: 0.9, gainScale: 0.9 }, // E5
    ],
  },
  "warm-harp": {
    "focus-end": [
      { freq: 440.0, delaySec: 0, durationSec: 0.8, gainScale: 0.85 }, // A4
      { freq: 659.25, delaySec: 0.15, durationSec: 0.9, gainScale: 0.9 }, // E5
      { freq: 880.0, delaySec: 0.3, durationSec: 1.2, gainScale: 0.95 }, // A5
    ],
    "break-start": [
      { freq: 523.25, delaySec: 0, durationSec: 0.75, gainScale: 0.8 }, // C5
      { freq: 392.0, delaySec: 0.18, durationSec: 1.0, gainScale: 0.75 }, // G4
    ],
    "break-end": [
      { freq: 440.0, delaySec: 0, durationSec: 0.65, gainScale: 0.8 }, // A4
      { freq: 659.25, delaySec: 0.16, durationSec: 0.85, gainScale: 0.85 }, // E5
    ],
  },
  "minimal-tone": {
    "focus-end": [
      { freq: 659.25, delaySec: 0, durationSec: 0.75, gainScale: 0.8 }, // E5
      { freq: 880.0, delaySec: 0.22, durationSec: 1.0, gainScale: 0.9 }, // A5
    ],
    "break-start": [
      { freq: 587.33, delaySec: 0, durationSec: 0.7, gainScale: 0.72 }, // D5
      { freq: 493.88, delaySec: 0.2, durationSec: 0.9, gainScale: 0.68 }, // B4
    ],
    "break-end": [
      { freq: 587.33, delaySec: 0, durationSec: 0.65, gainScale: 0.75 }, // D5
      { freq: 783.99, delaySec: 0.2, durationSec: 0.85, gainScale: 0.8 }, // G5
    ],
  },
};

export function getChimePattern(tone: ChimeTone, event: ChimeEvent): ChimeNote[] {
  return CHIME_PATTERNS[tone]?.[event] ?? CHIME_PATTERNS["gentle-bell"][event];
}

export function clampChimeVolume(volume: number | undefined): number {
  if (typeof volume !== "number" || !Number.isFinite(volume)) return 0.6;
  return Math.min(1, Math.max(0.1, Math.round(volume * 100) / 100));
}

export function shouldPlayTimerChime(params: {
  settingsSound: boolean;
  companionEnabled: boolean;
  companionSound: boolean;
}): boolean {
  if (!params.settingsSound) return false;
  if (params.companionEnabled && !params.companionSound) return false;
  return true;
}

let sharedChimeCtx: AudioContext | null = null;

function getOrCreateAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!sharedChimeCtx || sharedChimeCtx.state === "closed") {
    sharedChimeCtx = new AC();
  }
  return sharedChimeCtx;
}

export function warmUpChimeAudio(): boolean {
  try {
    const ac = getOrCreateAudioContext();
    if (!ac) return false;
    if (ac.state === "suspended" && typeof ac.resume === "function") {
      void ac.resume().catch(() => {});
    }
    return true;
  } catch {
    return false;
  }
}

export function playGentleChime(
  event: ChimeEvent,
  options?: { tone?: ChimeTone; volume?: number },
): boolean {
  try {
    const ac = getOrCreateAudioContext();
    if (!ac) return false;

    if (ac.state === "suspended" && typeof ac.resume === "function") {
      void ac.resume().catch(() => {});
    }

    const tone = options?.tone ?? "gentle-bell";
    const volume = clampChimeVolume(options?.volume);
    const notes = getChimePattern(tone, event);

    // Subtle maximum gain so chimes remain calm and non-startling even at 100%
    const maxPeakGain = 0.16 * volume;
    const baseTime = ac.currentTime;

    const outputNode: AudioNode = (() => {
      if (typeof ac.createBiquadFilter === "function") {
        const lp = ac.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = 2600;
        lp.connect(ac.destination);
        return lp;
      }
      return ac.destination;
    })();

    for (const note of notes) {
      const startAt = baseTime + note.delaySec;
      const stopAt = startAt + note.durationSec + 0.05;
      const peak = Math.max(0.005, maxPeakGain * note.gainScale);

      // Fundamental sine
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = "sine";
      osc.frequency.value = note.freq;

      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.linearRampToValueAtTime(peak, startAt + 0.022);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + note.durationSec);

      osc.connect(gain).connect(outputNode);
      osc.start(startAt);
      osc.stop(stopAt);

      // Soft warm octave overtone for bell/harp shimmer
      if (tone !== "minimal-tone") {
        const overtone = ac.createOscillator();
        const overtoneGain = ac.createGain();
        overtone.type = "sine";
        overtone.frequency.value = note.freq * 2;
        overtoneGain.gain.setValueAtTime(0.0001, startAt);
        overtoneGain.gain.linearRampToValueAtTime(peak * 0.2, startAt + 0.018);
        overtoneGain.gain.exponentialRampToValueAtTime(0.0001, startAt + note.durationSec * 0.55);
        overtone.connect(overtoneGain).connect(outputNode);
        overtone.start(startAt);
        overtone.stop(stopAt);
      }
    }

    return true;
  } catch {
    return false;
  }
}

export function resetChimeAudioForTests(): void {
  if (
    sharedChimeCtx &&
    sharedChimeCtx.state !== "closed" &&
    typeof sharedChimeCtx.close === "function"
  ) {
    void sharedChimeCtx.close().catch(() => {});
  }
  sharedChimeCtx = null;
}
