import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { remainingMs, type Session } from "./stats";

export type Theme = "light" | "dark" | "system";
export type Settings = { defaultMinutes: number; customMinutes: number; sound: boolean; notify: boolean; theme: Theme };
export type Timer = {
  minutes: number;
  status: "idle" | "running" | "paused" | "completed";
  endAt: number; // when running
  leftMs: number; // when paused/idle
};

const DEFAULT_SETTINGS: Settings = { defaultMinutes: 25, customMinutes: 15, sound: true, notify: false, theme: "system" };
const idle = (m: number): Timer => ({ minutes: m, status: "idle", endAt: 0, leftMs: m * 60000 });

function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? { ...fallback, ...JSON.parse(v) } : fallback;
  } catch {
    return fallback;
  }
}

type Ctx = {
  ready: boolean;
  settings: Settings;
  setSettings: (p: Partial<Settings>) => void;
  timer: Timer;
  left: number;
  sessions: Session[];
  selectMinutes: (m: number) => void;
  start: () => void;
  pause: () => void;
  resume: () => void;
  reset: () => void;
  end: () => void;
  dismiss: () => void;
  clearStats: () => void;
};
const FocusCtx = createContext<Ctx | null>(null);

function chime() {
  try {
    const ac = new AudioContext();
    [660, 880].forEach((f, i) => {
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.frequency.value = f;
      const t = ac.currentTime + i * 0.25;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.2, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      o.connect(g).connect(ac.destination);
      o.start(t);
      o.stop(t + 1);
    });
  } catch {}
}

export function FocusProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [settings, setSettingsState] = useState<Settings>(DEFAULT_SETTINGS);
  const [timer, setTimer] = useState<Timer>(idle(25));
  const [sessions, setSessions] = useState<Session[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    const s = load("focus.settings", DEFAULT_SETTINGS);
    setSettingsState(s);
    let ss: Session[] = [];
    try { ss = JSON.parse(localStorage.getItem("focus.sessions") ?? "[]"); } catch {}
    setSessions(ss);
    setTimer(load("focus.timer", idle(s.defaultMinutes)));
    setReady(true);
  }, []);

  useEffect(() => { if (ready) localStorage.setItem("focus.settings", JSON.stringify(settings)); }, [settings, ready]);
  useEffect(() => { if (ready) localStorage.setItem("focus.timer", JSON.stringify(timer)); }, [timer, ready]);
  useEffect(() => { if (ready) localStorage.setItem("focus.sessions", JSON.stringify(sessions)); }, [sessions, ready]);

  useEffect(() => {
    const root = document.documentElement;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => root.classList.toggle("dark", settings.theme === "dark" || (settings.theme === "system" && mq.matches));
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [settings.theme]);

  useEffect(() => {
    if (timer.status !== "running") return;
    const id = setInterval(() => setNow(Date.now()), 250);
    setNow(Date.now());
    return () => clearInterval(id);
  }, [timer.status]);

  // Completion detection, computed from the end timestamp so it never drifts.
  useEffect(() => {
    if (timer.status === "running" && remainingMs(timer.endAt, now) === 0) {
      setSessions((s) => [...s, { endedAt: timer.endAt, minutes: timer.minutes }]);
      setTimer((t) => ({ ...t, status: "completed", leftMs: 0 }));
      const st = settingsRef.current;
      if (st.sound) chime();
      if (st.notify && "Notification" in window && Notification.permission === "granted") {
        new Notification("Session completed!", { body: `You focused for ${timer.minutes} minutes.` });
      }
    }
  }, [now, timer]);

  const left = timer.status === "running" ? remainingMs(timer.endAt, now) : timer.leftMs;

  const setSettings = useCallback((p: Partial<Settings>) => setSettingsState((s) => ({ ...s, ...p })), []);
  const value = useMemo<Ctx>(() => ({
    ready, settings, setSettings, timer, left, sessions,
    selectMinutes: (m) => setTimer(idle(m)),
    start: () => { const n = Date.now(); setNow(n); setTimer((t) => ({ ...t, status: "running", endAt: n + t.minutes * 60000 })); },
    pause: () => setTimer((t) => ({ ...t, status: "paused", leftMs: remainingMs(t.endAt, Date.now()) })),
    resume: () => { const n = Date.now(); setNow(n); setTimer((t) => ({ ...t, status: "running", endAt: n + t.leftMs })); },
    reset: () => setTimer((t) => idle(t.minutes)),
    end: () => setTimer((t) => idle(t.minutes)),
    dismiss: () => setTimer((t) => idle(t.minutes)),
    clearStats: () => setSessions([]),
  }), [ready, settings, setSettings, timer, left, sessions]);

  return <FocusCtx.Provider value={value}>{children}</FocusCtx.Provider>;
}

export function useFocus() {
  const c = useContext(FocusCtx);
  if (!c) throw new Error("useFocus outside FocusProvider");
  return c;
}
