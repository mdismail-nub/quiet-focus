import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { remainingMs, type Session } from "./stats";
import { startAmbient, type Ambient } from "./ambient";

export type Theme = "light" | "dark" | "system";
export type LandscapeTheme = "minimal" | "midnight" | "sunset" | "forest";
export type Settings = {
  defaultMinutes: number;
  customMinutes: number;
  sound: boolean;
  notify: boolean;
  theme: Theme;
  landscapeTheme: LandscapeTheme;
  ambient: Ambient;
  pomodoro: boolean;
  breakMinutes: number;
  dailyGoal: number;
  keepAwake: boolean;
};
export type Timer = {
  minutes: number;
  kind: "focus" | "break";
  focusMinutes: number; // focus length to return to after a break
  label: string;
  status: "idle" | "running" | "paused" | "completed";
  endAt: number;
  leftMs: number;
};

const DEFAULT_SETTINGS: Settings = {
  defaultMinutes: 25,
  customMinutes: 15,
  sound: true,
  notify: false,
  theme: "system",
  landscapeTheme: "minimal",
  ambient: "off",
  pomodoro: false,
  breakMinutes: 5,
  dailyGoal: 120,
  keepAwake: true,
};
const idle = (m: number, label = ""): Timer => ({
  minutes: m,
  kind: "focus",
  focusMinutes: m,
  label,
  status: "idle",
  endAt: 0,
  leftMs: m * 60000,
});

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
  setLabel: (l: string) => void;
  start: () => void;
  startBreak: () => void;
  pause: () => void;
  resume: () => void;
  reset: () => void;
  end: () => void;
  dismiss: () => void;
  clearStats: () => void;
  immersiveManual: boolean;
  setImmersiveManual: (v: boolean) => void;
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
  } catch {
    // AudioContext may be unavailable or blocked before user gesture.
  }
}

function notify(title: string, body: string) {
  try {
    if ("Notification" in window && Notification.permission === "granted")
      new Notification(title, { body });
  } catch {
    // Notifications may be unsupported in this environment.
  }
}

export function FocusProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [settings, setSettingsState] = useState<Settings>(DEFAULT_SETTINGS);
  const [timer, setTimer] = useState<Timer>(idle(25));
  const [sessions, setSessions] = useState<Session[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [immersiveManual, setImmersiveManual] = useState(false);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    const s = load("focus.settings", DEFAULT_SETTINGS);
    setSettingsState(s);
    let ss: Session[] = [];
    try {
      ss = JSON.parse(localStorage.getItem("focus.sessions") ?? "[]");
    } catch {
      ss = [];
    }
    setSessions(ss);
    setTimer(load("focus.timer", idle(s.defaultMinutes)));
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) localStorage.setItem("focus.settings", JSON.stringify(settings));
  }, [settings, ready]);
  useEffect(() => {
    if (ready) localStorage.setItem("focus.timer", JSON.stringify(timer));
  }, [timer, ready]);
  useEffect(() => {
    if (ready) localStorage.setItem("focus.sessions", JSON.stringify(sessions));
  }, [sessions, ready]);

  useEffect(() => {
    const root = document.documentElement;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () =>
      root.classList.toggle(
        "dark",
        settings.theme === "dark" || (settings.theme === "system" && mq.matches),
      );
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [settings.theme]);

  const running = timer.status === "running";

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    setNow(Date.now());
    return () => clearInterval(id);
  }, [running]);

  // Ambient sound only while a focus session runs.
  useEffect(() => {
    if (!running || timer.kind !== "focus" || settings.ambient === "off") return;
    return startAmbient(settings.ambient);
  }, [running, timer.kind, settings.ambient]);

  // Keep the screen on during sessions where the Wake Lock API exists; re-acquire after tab switches.
  useEffect(() => {
    if (!running || !settings.keepAwake || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let alive = true;
    const get = () => {
      if (document.visibilityState !== "visible") return;
      navigator.wakeLock
        .request("screen")
        .then((l) => {
          if (alive) lock = l;
          else l.release();
        })
        .catch(() => {});
    };
    get();
    document.addEventListener("visibilitychange", get);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", get);
      lock?.release().catch(() => {});
    };
  }, [running, settings.keepAwake]);

  // Completion detection, computed from the end timestamp so it never drifts.
  useEffect(() => {
    if (timer.status !== "running" || remainingMs(timer.endAt, now) > 0) return;
    const st = settingsRef.current;
    if (st.sound) chime();
    if (timer.kind === "break") {
      setTimer(idle(timer.focusMinutes, timer.label));
      if (st.notify) notify("Break is over", "Ready for the next session?");
      return;
    }
    setSessions((s) => [
      ...s,
      {
        endedAt: timer.endAt,
        minutes: timer.minutes,
        ...(timer.label ? { label: timer.label } : {}),
      },
    ]);
    setTimer((t) => ({ ...t, status: "completed", leftMs: 0 }));
    if (st.notify) notify("Session completed!", `You focused for ${timer.minutes} minutes.`);
  }, [now, timer]);

  const left = running ? remainingMs(timer.endAt, now) : timer.leftMs;

  const setSettings = useCallback(
    (p: Partial<Settings>) => setSettingsState((s) => ({ ...s, ...p })),
    [],
  );
  const value = useMemo<Ctx>(
    () => ({
      ready,
      settings,
      setSettings,
      timer,
      left,
      sessions,
      immersiveManual,
      setImmersiveManual,
      selectMinutes: (m) => setTimer((t) => idle(m, t.label)),
      setLabel: (label) => setTimer((t) => ({ ...t, label })),
      start: () => {
        const n = Date.now();
        setNow(n);
        setTimer((t) => ({
          ...idle(t.focusMinutes, t.label),
          status: "running",
          endAt: n + t.focusMinutes * 60000,
        }));
      },
      startBreak: () => {
        const n = Date.now();
        setNow(n);
        const b = settingsRef.current.breakMinutes;
        setTimer((t) => ({
          ...t,
          kind: "break",
          minutes: b,
          status: "running",
          endAt: n + b * 60000,
          leftMs: b * 60000,
        }));
      },
      pause: () =>
        setTimer((t) => ({ ...t, status: "paused", leftMs: remainingMs(t.endAt, Date.now()) })),
      resume: () => {
        const n = Date.now();
        setNow(n);
        setTimer((t) => ({ ...t, status: "running", endAt: n + t.leftMs }));
      },
      reset: () => setTimer((t) => idle(t.focusMinutes, t.label)),
      end: () => setTimer((t) => idle(t.focusMinutes, t.label)),
      dismiss: () => setTimer((t) => idle(t.focusMinutes, t.label)),
      clearStats: () => setSessions([]),
    }),
    [ready, settings, setSettings, timer, left, sessions, immersiveManual],
  );

  return <FocusCtx.Provider value={value}>{children}</FocusCtx.Provider>;
}

export function useFocus() {
  const c = useContext(FocusCtx);
  if (!c) throw new Error("useFocus outside FocusProvider");
  return c;
}
