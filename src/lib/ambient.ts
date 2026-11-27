export type Ambient = "off" | "rain" | "ocean" | "fire" | "white";

// Ambient sounds are synthesized with Web Audio so nothing needs downloading.
export function startAmbient(kind: Exclude<Ambient, "off">): () => void {
  const AC = typeof window !== "undefined" ? window.AudioContext : undefined;
  if (!AC) return () => {};
  const ac = new AC();
  const len = ac.sampleRate * 4;
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === "fire" || kind === "ocean") {
      last = (last + 0.02 * w) / 1.02; // brown noise
      d[i] = last * 3.5;
    } else d[i] = w;
  }
  const src = ac.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const filter = ac.createBiquadFilter();
  const gain = ac.createGain();
  const master = ac.createGain();
  master.gain.value = 0;
  master.gain.linearRampToValueAtTime(1, ac.currentTime + 1.5);
  if (kind === "rain") { filter.type = "bandpass"; filter.frequency.value = 1400; filter.Q.value = 0.6; gain.gain.value = 0.25; }
  if (kind === "white") { filter.type = "lowpass"; filter.frequency.value = 9000; gain.gain.value = 0.08; }
  if (kind === "fire") { filter.type = "lowpass"; filter.frequency.value = 600; gain.gain.value = 0.5; }
  if (kind === "ocean") {
    filter.type = "lowpass"; filter.frequency.value = 500; gain.gain.value = 0.35;
    const lfo = ac.createOscillator(); const lg = ac.createGain();
    lfo.frequency.value = 0.09; lg.gain.value = 0.3;
    lfo.connect(lg).connect(gain.gain); lfo.start();
  }
  src.connect(filter).connect(gain).connect(master).connect(ac.destination);
  src.start();
  let crackle: ReturnType<typeof setInterval> | undefined;
  if (kind === "fire") {
    crackle = setInterval(() => {
      if (Math.random() > 0.45) return;
      const o = ac.createBufferSource(); o.buffer = buf;
      const f = ac.createBiquadFilter(); f.type = "highpass"; f.frequency.value = 2500;
      const g = ac.createGain(); const t = ac.currentTime;
      g.gain.setValueAtTime(0.4 * Math.random(), t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      o.connect(f).connect(g).connect(master); o.start(t, Math.random() * 3, 0.06);
    }, 180);
  }
  return () => {
    if (crackle) clearInterval(crackle);
    master.gain.linearRampToValueAtTime(0, ac.currentTime + 0.4);
    setTimeout(() => ac.close().catch(() => {}), 500);
  };
}
