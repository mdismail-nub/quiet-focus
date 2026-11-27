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
import { onAuthStateChanged, signInWithPopup, signOut, type User } from "firebase/auth";
import { remainingMs, type Session } from "./stats";
import { startAmbient, type Ambient } from "./ambient";
import { auth, formatFirebaseAuthError, googleProvider, testConnection } from "./firebase";
import {
  computeAnalytics,
  computeGamificationSummary,
  createSessionId,
  evaluateAchievements,
  evaluateDailyChallenges,
  normalizeSession,
  type AnalyticsSummary,
  type AvatarId,
  type FocusSessionRecord,
  type GamificationSummary,
  type PendingSyncItem,
  type PrivacySetting,
  type SyncStatus,
} from "./gamification";
import {
  checkServerConnectivity,
  enqueuePendingSession,
  loadSyncQueue,
  saveSyncQueue,
  syncPendingSessions,
} from "./sync-service";
import { ensureUserProfile, updateUserProfile, type UserProfileData } from "./social-service";

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
  startedAt: number;
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
  dailyGoal: 60,
  keepAwake: true,
};

const idle = (m: number, label = ""): Timer => ({
  minutes: m,
  kind: "focus",
  focusMinutes: m,
  label,
  status: "idle",
  startedAt: 0,
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

function loadJson<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
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
  sessions: FocusSessionRecord[];
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
  // Gamification & analytics
  gamification: GamificationSummary;
  analytics: AnalyticsSummary;
  achievementUnlocks: Record<string, number>;
  // Auth & Profile
  authReady: boolean;
  user: User | null;
  profile: UserProfileData | null;
  authError: string | null;
  signingIn: boolean;
  signInWithGoogle: () => Promise<void>;
  signOutAccount: () => Promise<void>;
  saveProfileChanges: (updates: {
    username?: string;
    avatarId?: AvatarId;
    privacy?: PrivacySetting;
    dailyGoal?: number;
  }) => Promise<void>;
  refreshProfile: () => Promise<void>;
  // Offline-first synchronization
  serverOnline: boolean;
  syncStatus: SyncStatus;
  syncQueue: PendingSyncItem[];
  pendingCount: number;
  pendingMinutes: number;
  lastSyncError: string | null;
  syncNotice: string | null;
  dismissSyncNotice: () => void;
  triggerSync: () => Promise<void>;
  leaderboardVersion: number;
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
  const [sessions, setSessions] = useState<FocusSessionRecord[]>([]);
  const [achievementUnlocks, setAchievementUnlocks] = useState<Record<string, number>>({});
  const [claimedChallenges, setClaimedChallenges] = useState<string[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [immersiveManual, setImmersiveManual] = useState(false);

  // Auth & Profile state
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfileData | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);

  // Sync & connectivity state
  const [serverOnline, setServerOnline] = useState(true);
  const [syncQueue, setSyncQueue] = useState<PendingSyncItem[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("synced");
  const [lastSyncError, setLastSyncError] = useState<string | null>(null);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  const [leaderboardVersion, setLeaderboardVersion] = useState(0);

  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;
  const userRef = useRef(user);
  userRef.current = user;
  const syncingRef = useRef(false);
  const wasOfflineOrPendingRef = useRef(false);

  // Initial load from localStorage
  useEffect(() => {
    const s = load("focus.settings", DEFAULT_SETTINGS);
    setSettingsState(s);

    const rawSessions = loadJson<Session[]>("focus.sessions", []);
    const normalized = Array.isArray(rawSessions) ? rawSessions.map(normalizeSession) : [];
    setSessions(normalized);

    setAchievementUnlocks(loadJson<Record<string, number>>("focus.achievements", {}));
    setClaimedChallenges(loadJson<string[]>("focus.challenges", []));

    const loadedQueue = loadSyncQueue();
    setSyncQueue(loadedQueue);
    if (loadedQueue.length > 0) {
      setSyncStatus(navigator.onLine ? "waiting" : "offline");
      wasOfflineOrPendingRef.current = true;
    }

    const loadedTimer = load("focus.timer", idle(s.defaultMinutes));
    if (loadedTimer.status === "running" && !loadedTimer.startedAt) {
      loadedTimer.startedAt = loadedTimer.endAt - loadedTimer.minutes * 60000;
    }
    setTimer(loadedTimer);
    setReady(true);

    void testConnection();
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
    if (ready) localStorage.setItem("focus.achievements", JSON.stringify(achievementUnlocks));
  }, [achievementUnlocks, ready]);
  useEffect(() => {
    if (ready) localStorage.setItem("focus.challenges", JSON.stringify(claimedChallenges));
  }, [claimedChallenges, ready]);

  // App Light / Dark theme
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

  // Firebase Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      setAuthError(null);
      if (nextUser) {
        try {
          const prof = await ensureUserProfile(nextUser, settingsRef.current.dailyGoal);
          setProfile(prof);
        } catch (err) {
          setAuthError(err instanceof Error ? err.message : "Could not load profile.");
        }
      } else {
        setProfile(null);
      }
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  const refreshProfile = useCallback(async () => {
    const u = userRef.current;
    if (!u) return;
    try {
      const prof = await ensureUserProfile(u, settingsRef.current.dailyGoal);
      setProfile(prof);
    } catch {
      // Best-effort refresh
    }
  }, []);

  const triggerSync = useCallback(async () => {
    if (syncingRef.current) return;
    const queue = loadSyncQueue();
    setSyncQueue(queue);

    const reachable = await checkServerConnectivity();
    setServerOnline(reachable);

    if (!reachable) {
      setSyncStatus("offline");
      if (queue.length > 0) wasOfflineOrPendingRef.current = true;
      return;
    }

    if (queue.length === 0) {
      if (wasOfflineOrPendingRef.current) {
        wasOfflineOrPendingRef.current = false;
      }
      setSyncStatus("synced");
      setLastSyncError(null);
      return;
    }

    const u = userRef.current;
    if (!u) {
      setSyncStatus("waiting");
      return;
    }

    syncingRef.current = true;
    setSyncStatus("syncing");
    setLastSyncError(null);

    try {
      const result = await syncPendingSessions({
        uid: u.uid,
        allSessions: sessionsRef.current,
        dailyGoal: settingsRef.current.dailyGoal,
      });

      setSyncQueue(result.remainingQueue);
      if (result.syncedSessionIds.length > 0) {
        const syncedSet = new Set(result.syncedSessionIds);
        const ts = Date.now();
        setSessions((prev) =>
          prev.map((s) => (syncedSet.has(s.id) ? { ...s, synced: true, syncedAt: ts } : s)),
        );
      }

      if (result.status === "synced") {
        setSyncStatus("synced");
        setLastSyncError(null);
        await refreshProfile();
        setLeaderboardVersion((v) => v + 1);
        if (result.syncedCount > 0 || wasOfflineOrPendingRef.current) {
          wasOfflineOrPendingRef.current = false;
          setSyncNotice(
            "You're back online! Your focus sessions have been synchronized and your leaderboard is updated.",
          );
        }
      } else {
        setSyncStatus(result.status);
        setLastSyncError(result.errorMessage ?? null);
      }
    } catch (err) {
      setSyncStatus("failed");
      setLastSyncError(err instanceof Error ? err.message : "Synchronization failed.");
    } finally {
      syncingRef.current = false;
    }
  }, [refreshProfile]);

  // Monitor real server connectivity & trigger automatic sync on reconnect
  useEffect(() => {
    if (!ready) return;

    const probeAndSync = async () => {
      const reachable = await checkServerConnectivity();
      setServerOnline(reachable);
      if (!reachable) {
        setSyncStatus("offline");
        wasOfflineOrPendingRef.current = true;
        return;
      }
      const q = loadSyncQueue();
      if (q.length > 0 && userRef.current) {
        void triggerSync();
      } else if (q.length > 0) {
        setSyncStatus("waiting");
      } else {
        setSyncStatus("synced");
      }
    };

    void probeAndSync();

    const onOnline = () => {
      void probeAndSync();
    };
    const onOffline = () => {
      setServerOnline(false);
      setSyncStatus("offline");
      wasOfflineOrPendingRef.current = true;
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    const intervalId = window.setInterval(() => {
      if (loadSyncQueue().length > 0 || !serverOnline) {
        void probeAndSync();
      }
    }, 15_000);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.clearInterval(intervalId);
    };
  }, [ready, triggerSync, serverOnline]);

  // Sync automatically when user finishes signing in
  useEffect(() => {
    if (ready && user && profile && loadSyncQueue().length > 0) {
      void triggerSync();
    }
  }, [ready, user, profile, triggerSync]);

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

    const endedAt = timer.endAt;
    const startedAt = timer.startedAt || endedAt - timer.minutes * 60000;
    const sessionRecord: FocusSessionRecord = {
      id: createSessionId(endedAt),
      startedAt,
      endedAt,
      minutes: timer.minutes,
      ...(timer.label ? { label: timer.label.slice(0, 60) } : {}),
      synced: false,
    };

    const nextSessions = [...sessionsRef.current, sessionRecord];
    setSessions(nextSessions);

    // Record local single-grant achievement & daily challenge unlocks
    const { newlyUnlocked } = evaluateAchievements(
      nextSessions,
      st.dailyGoal,
      achievementUnlocks,
      endedAt,
    );
    if (Object.keys(newlyUnlocked).length > 0) {
      setAchievementUnlocks((prev) => ({ ...prev, ...newlyUnlocked }));
    }

    const completedChallenges = evaluateDailyChallenges(nextSessions, st.dailyGoal, endedAt).filter(
      (c) => c.completed,
    );
    if (completedChallenges.length > 0) {
      setClaimedChallenges((prev) => {
        const set = new Set(prev);
        for (const c of completedChallenges) set.add(`${c.dayKey}_${c.id}`);
        return Array.from(set);
      });
    }

    // Enqueue persistently for idempotent server sync
    const nextQueue = enqueuePendingSession(sessionRecord);
    setSyncQueue(nextQueue);
    setSyncStatus(serverOnline ? "waiting" : "offline");
    if (!serverOnline) wasOfflineOrPendingRef.current = true;

    setTimer((t) => ({ ...t, status: "completed", leftMs: 0 }));
    if (st.notify) notify("Session completed!", `You focused for ${timer.minutes} minutes.`);

    if (userRef.current) {
      void triggerSync();
    }
  }, [now, timer, achievementUnlocks, serverOnline, triggerSync]);

  const left = running ? remainingMs(timer.endAt, now) : timer.leftMs;

  const setSettings = useCallback(
    (p: Partial<Settings>) => setSettingsState((s) => ({ ...s, ...p })),
    [],
  );

  const signingInRef = useRef(false);

  const signInWithGoogle = useCallback(async () => {
    if (signingInRef.current) return;
    signingInRef.current = true;
    setSigningIn(true);
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      const friendly = formatFirebaseAuthError(err);
      if (friendly !== null) {
        setAuthError(friendly);
      }
    } finally {
      signingInRef.current = false;
      setSigningIn(false);
    }
  }, []);

  const signOutAccount = useCallback(async () => {
    setAuthError(null);
    await signOut(auth);
    setProfile(null);
  }, []);

  const saveProfileChanges = useCallback(
    async (updates: {
      username?: string;
      avatarId?: AvatarId;
      privacy?: PrivacySetting;
      dailyGoal?: number;
    }) => {
      const u = userRef.current;
      if (!u || !profile) throw new Error("Sign in to update your profile.");
      const updated = await updateUserProfile(u.uid, profile, updates);
      setProfile(updated);
      if (updates.dailyGoal !== undefined) {
        setSettings({ dailyGoal: updates.dailyGoal });
      }
      setLeaderboardVersion((v) => v + 1);
    },
    [profile, setSettings],
  );

  const gamification = useMemo(
    () =>
      computeGamificationSummary(
        sessions,
        settings.dailyGoal,
        achievementUnlocks,
        claimedChallenges,
      ),
    [sessions, settings.dailyGoal, achievementUnlocks, claimedChallenges],
  );

  const analytics = useMemo(() => computeAnalytics(sessions), [sessions]);

  const pendingCount = syncQueue.length;
  const pendingMinutes = useMemo(
    () => syncQueue.reduce((sum, item) => sum + item.minutes, 0),
    [syncQueue],
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
          startedAt: n,
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
          startedAt: n,
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
      clearStats: () => {
        setSessions([]);
        setAchievementUnlocks({});
        setClaimedChallenges([]);
        saveSyncQueue([]);
        setSyncQueue([]);
      },
      gamification,
      analytics,
      achievementUnlocks,
      authReady,
      user,
      profile,
      authError,
      signingIn,
      signInWithGoogle,
      signOutAccount,
      saveProfileChanges,
      refreshProfile,
      serverOnline,
      syncStatus,
      syncQueue,
      pendingCount,
      pendingMinutes,
      lastSyncError,
      syncNotice,
      dismissSyncNotice: () => setSyncNotice(null),
      triggerSync,
      leaderboardVersion,
    }),
    [
      ready,
      settings,
      setSettings,
      timer,
      left,
      sessions,
      immersiveManual,
      gamification,
      analytics,
      achievementUnlocks,
      authReady,
      user,
      profile,
      authError,
      signingIn,
      signInWithGoogle,
      signOutAccount,
      saveProfileChanges,
      refreshProfile,
      serverOnline,
      syncStatus,
      syncQueue,
      pendingCount,
      pendingMinutes,
      lastSyncError,
      syncNotice,
      triggerSync,
      leaderboardVersion,
    ],
  );

  return <FocusCtx.Provider value={value}>{children}</FocusCtx.Provider>;
}

export function useFocus() {
  const c = useContext(FocusCtx);
  if (!c) throw new Error("useFocus outside FocusProvider");
  return c;
}
