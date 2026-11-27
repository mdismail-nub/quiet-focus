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
import {
  buildBreakCompletePayload,
  buildBreakStartPayload,
  buildFocusPausedPayload,
  buildFocusStartPayload,
  buildSessionCompletePayload,
  defaultNotificationPreferences,
  sanitizeNotificationPreferences,
  type NotificationPermissionState,
  type NotificationPreferences,
} from "./notifications-core";
import {
  loadNotificationRecord,
  saveNotificationRecord,
  saveTimerSnapshotToDB,
} from "./notification-db";
import {
  cancelSessionScheduleOnServer,
  closeAppNotificationsByTag,
  getNotificationSupport,
  getPermissionState,
  requestNotificationPermissionExplicit,
  sendServerOrLocalTestNotification,
  showAppNotification,
  syncPushSubscriptionAndPrefs,
  syncSessionScheduleToServer,
  type NotificationSupportInfo,
} from "./notification-client";

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
  sessionId?: string;
  scheduleVersion?: number;
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

const idle = (m: number, label = "", scheduleVersion = 0): Timer => ({
  minutes: m,
  kind: "focus",
  focusMinutes: m,
  label,
  status: "idle",
  startedAt: 0,
  endAt: 0,
  leftMs: m * 60000,
  sessionId: "",
  scheduleVersion,
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
  // Focus Companion Notifications
  notificationPrefs: NotificationPreferences;
  notificationPermission: NotificationPermissionState;
  notificationSupport: NotificationSupportInfo;
  pushSubscribed: boolean;
  pushSyncPending: boolean;
  notificationSyncError: string | null;
  setNotificationPrefs: (patch: Partial<NotificationPreferences>) => void;
  enableCompanionNotifications: (patch?: Partial<NotificationPreferences>) => Promise<{
    ok: boolean;
    permission: NotificationPermissionState;
    offline: boolean;
    error?: string;
  }>;
  disableCompanionNotifications: () => Promise<void>;
  syncNotificationPrefsNow: () => Promise<void>;
  sendTestCompanionNotification: () => Promise<{
    ok: boolean;
    via: "push" | "local" | "none";
    message: string;
  }>;
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

  // Notification companion state
  const [notificationPrefs, setNotificationPrefsState] = useState<NotificationPreferences>(() =>
    defaultNotificationPreferences(),
  );
  const [notificationPermission, setNotificationPermission] =
    useState<NotificationPermissionState>("default");
  const [notificationSupport, setNotificationSupport] = useState<NotificationSupportInfo>(() =>
    getNotificationSupport(),
  );
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushSyncPending, setPushSyncPending] = useState(false);
  const [notificationSyncError, setNotificationSyncError] = useState<string | null>(null);

  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;
  const userRef = useRef(user);
  userRef.current = user;
  const timerRef = useRef(timer);
  timerRef.current = timer;
  const notificationPrefsRef = useRef(notificationPrefs);
  notificationPrefsRef.current = notificationPrefs;
  const notificationPrefsModifiedRef = useRef(false);
  const syncingRef = useRef(false);
  const wasOfflineOrPendingRef = useRef(false);

  // Initial load from localStorage & IndexedDB
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
    if (loadedTimer.status === "running" && !loadedTimer.sessionId) {
      loadedTimer.sessionId = createSessionId(loadedTimer.startedAt || Date.now());
      loadedTimer.scheduleVersion = loadedTimer.scheduleVersion ?? 1;
    }
    setTimer(loadedTimer);
    setNotificationSupport(getNotificationSupport());
    setNotificationPermission(getPermissionState());
    setReady(true);

    void loadNotificationRecord().then((rec) => {
      if (!notificationPrefsModifiedRef.current) {
        const migratedPrefs =
          s.notify && !rec.preferences.enabled && getPermissionState() === "granted"
            ? { ...rec.preferences, enabled: true }
            : rec.preferences;
        notificationPrefsRef.current = migratedPrefs;
        setNotificationPrefsState(migratedPrefs);
      }
      setPushSubscribed(Boolean(rec.pushEndpoint));
      setPushSyncPending(rec.pendingSync);
    });

    void testConnection();
  }, []);

  useEffect(() => {
    if (ready) localStorage.setItem("focus.settings", JSON.stringify(settings));
  }, [settings, ready]);
  useEffect(() => {
    if (ready) {
      localStorage.setItem("focus.timer", JSON.stringify(timer));
      void saveTimerSnapshotToDB({
        sessionId: timer.sessionId ?? "",
        scheduleVersion: timer.scheduleVersion ?? 0,
        kind: timer.kind,
        status: timer.status,
        minutes: timer.minutes,
        label: timer.label,
        startedAt: timer.startedAt,
        endAt: timer.endAt,
        leftMs: timer.leftMs,
        updatedAt: Date.now(),
      });
    }
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

  const syncNotificationPrefsNow = useCallback(async () => {
    const prefs = notificationPrefsRef.current;
    const status = timerRef.current.status;
    const activeSessionStatus: "idle" | "running" | "paused" =
      status === "running" ? "running" : status === "paused" ? "paused" : "idle";
    let idToken: string | null = null;
    if (userRef.current) {
      idToken = await userRef.current.getIdToken().catch(() => null);
    }
    const res = await syncPushSubscriptionAndPrefs({
      preferences: prefs,
      activeSessionStatus,
      idToken,
    });
    setPushSubscribed(res.subscribed);
    setPushSyncPending(res.offline);
    setNotificationSyncError(res.error ?? null);

    // If reconnected during an active running session, ensure completion schedule is registered
    const curTimer = timerRef.current;
    if (
      !res.offline &&
      res.subscribed &&
      prefs.enabled &&
      curTimer.status === "running" &&
      curTimer.endAt > Date.now()
    ) {
      const sid = curTimer.sessionId || createSessionId(curTimer.startedAt || Date.now());
      const ver = curTimer.scheduleVersion || 1;
      await syncSessionScheduleToServer({
        sessionId: sid,
        scheduleVersion: ver,
        kind: curTimer.kind,
        expectedEndAt: curTimer.endAt,
        minutes: curTimer.minutes,
        label: curTimer.label,
        idToken,
      });
    }
  }, []);

  // Monitor real server connectivity & trigger automatic sync on reconnect
  useEffect(() => {
    if (!ready) return;

    const probeAndSync = async () => {
      const reachable = await checkServerConnectivity();
      setServerOnline(reachable);
      setNotificationPermission(getPermissionState());
      if (!reachable) {
        setSyncStatus("offline");
        wasOfflineOrPendingRef.current = true;
        return;
      }
      const rec = await loadNotificationRecord();
      if (rec.pendingSync) {
        void syncNotificationPrefsNow();
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
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        setNotificationPermission(getPermissionState());
      }
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisibility);
    const intervalId = window.setInterval(() => {
      if (loadSyncQueue().length > 0 || !serverOnline) {
        void probeAndSync();
      }
    }, 15_000);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(intervalId);
    };
  }, [ready, triggerSync, serverOnline, syncNotificationPrefsNow]);

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
    const np = notificationPrefsRef.current;
    const perm = getPermissionState();
    const shouldPlaySound = st.sound && (!np.enabled || np.sound);
    if (shouldPlaySound) chime();

    const activeSessionId = timer.sessionId || createSessionId(timer.endAt);
    void closeAppNotificationsByTag("focus-active-session");

    if (timer.kind === "break") {
      setTimer(idle(timer.focusMinutes, timer.label, (timer.scheduleVersion ?? 0) + 1));
      if ((np.enabled && np.breakReminders && perm === "granted") || st.notify) {
        void showAppNotification(
          buildBreakCompletePayload({
            sessionId: activeSessionId,
            minutes: timer.minutes,
            sound: np.sound,
          }),
        );
      }
      void cancelSessionScheduleOnServer({
        sessionId: activeSessionId,
        nextStatus: "idle",
      });
      return;
    }

    const endedAt = timer.endAt;
    const startedAt = timer.startedAt || endedAt - timer.minutes * 60000;
    const sessionRecord: FocusSessionRecord = {
      id: activeSessionId,
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

    if ((np.enabled && np.sessionCompletion && perm === "granted") || st.notify) {
      void showAppNotification(
        buildSessionCompletePayload({
          sessionId: activeSessionId,
          minutes: timer.minutes,
          label: timer.label,
          sound: np.sound,
        }),
      );
    }
    void cancelSessionScheduleOnServer({
      sessionId: activeSessionId,
      nextStatus: "idle",
    });

    if (userRef.current) {
      void triggerSync();
    }
  }, [now, timer, achievementUnlocks, serverOnline, triggerSync]);

  const left = running ? remainingMs(timer.endAt, now) : timer.leftMs;

  const setSettings = useCallback(
    (p: Partial<Settings>) => setSettingsState((s) => ({ ...s, ...p })),
    [],
  );

  const setNotificationPrefs = useCallback(
    (patch: Partial<NotificationPreferences>) => {
      notificationPrefsModifiedRef.current = true;
      setNotificationPrefsState((prev) => {
        const next = sanitizeNotificationPreferences({
          ...prev,
          ...patch,
          updatedAt: Date.now(),
        });
        notificationPrefsRef.current = next;
        if (patch.enabled !== undefined) {
          setSettingsState((s) => ({ ...s, notify: Boolean(patch.enabled) }));
        }
        void loadNotificationRecord().then(async (rec) => {
          await saveNotificationRecord({
            ...rec,
            preferences: next,
            pendingSync: true,
          });
          setPushSyncPending(true);
          if (typeof navigator === "undefined" || navigator.onLine) {
            void syncNotificationPrefsNow();
          }
        });
        return next;
      });
    },
    [syncNotificationPrefsNow],
  );

  const enableCompanionNotifications = useCallback(
    async (patch?: Partial<NotificationPreferences>) => {
      const support = getNotificationSupport();
      setNotificationSupport(support);
      if (!support.notificationApi) {
        setNotificationPermission("unsupported");
        return {
          ok: false,
          permission: "unsupported" as NotificationPermissionState,
          offline: typeof navigator !== "undefined" ? !navigator.onLine : false,
          error: "Notifications are not supported in this browser.",
        };
      }

      const perm = await requestNotificationPermissionExplicit();
      setNotificationPermission(perm);

      if (perm !== "granted") {
        return {
          ok: false,
          permission: perm,
          offline: typeof navigator !== "undefined" ? !navigator.onLine : false,
          error:
            perm === "denied"
              ? "Notifications are blocked in your browser settings."
              : "Notification permission was not granted.",
        };
      }

      const nextPrefs = sanitizeNotificationPreferences({
        ...notificationPrefsRef.current,
        ...patch,
        enabled: true,
        onboardingCompleted: true,
        updatedAt: Date.now(),
      });
      notificationPrefsModifiedRef.current = true;
      notificationPrefsRef.current = nextPrefs;
      setNotificationPrefsState(nextPrefs);
      setSettingsState((s) => ({ ...s, notify: true }));

      let idToken: string | null = null;
      if (userRef.current) {
        idToken = await userRef.current.getIdToken().catch(() => null);
      }

      const status = timerRef.current.status;
      const res = await syncPushSubscriptionAndPrefs({
        preferences: nextPrefs,
        activeSessionStatus:
          status === "running" ? "running" : status === "paused" ? "paused" : "idle",
        idToken,
        forceSubscribe: true,
      });

      setPushSubscribed(res.subscribed);
      setPushSyncPending(res.offline);
      setNotificationSyncError(res.error ?? null);

      return {
        ok: true,
        permission: perm,
        offline: res.offline,
        ...(res.error ? { error: res.error } : {}),
      };
    },
    [],
  );

  const disableCompanionNotifications = useCallback(async () => {
    const nextPrefs = sanitizeNotificationPreferences({
      ...notificationPrefsRef.current,
      enabled: false,
      updatedAt: Date.now(),
    });
    notificationPrefsModifiedRef.current = true;
    notificationPrefsRef.current = nextPrefs;
    setNotificationPrefsState(nextPrefs);
    setSettingsState((s) => ({ ...s, notify: false }));
    void closeAppNotificationsByTag("focus-active-session");

    let idToken: string | null = null;
    if (userRef.current) {
      idToken = await userRef.current.getIdToken().catch(() => null);
    }
    const res = await syncPushSubscriptionAndPrefs({
      preferences: nextPrefs,
      activeSessionStatus: "idle",
      idToken,
    });
    setPushSubscribed(res.subscribed);
    setPushSyncPending(res.offline);
    setNotificationSyncError(res.error ?? null);
  }, []);

  const sendTestCompanionNotification = useCallback(async () => {
    let idToken: string | null = null;
    if (userRef.current) {
      idToken = await userRef.current.getIdToken().catch(() => null);
    }
    return sendServerOrLocalTestNotification(idToken);
  }, []);

  const start = useCallback(() => {
    const n = Date.now();
    setNow(n);
    const cur = timerRef.current;
    if (cur.status === "running") return; // Guard against duplicate session starts

    const sessionId = createSessionId(n);
    const scheduleVersion = (cur.scheduleVersion ?? 0) + 1;
    const endAt = n + cur.focusMinutes * 60000;

    setTimer({
      ...idle(cur.focusMinutes, cur.label, scheduleVersion),
      status: "running",
      startedAt: n,
      endAt,
      sessionId,
      scheduleVersion,
    });

    const np = notificationPrefsRef.current;
    if (np.enabled && getPermissionState() === "granted") {
      if (np.sessionOngoing) {
        void showAppNotification(
          buildFocusStartPayload({
            sessionId,
            scheduleVersion,
            minutes: cur.focusMinutes,
            remainingMinutes: cur.focusMinutes,
            endAt,
            label: cur.label,
            timezone: np.timezone,
          }),
        );
      }
      if (np.sessionCompletion) {
        void syncSessionScheduleToServer({
          sessionId,
          scheduleVersion,
          kind: "focus",
          expectedEndAt: endAt,
          minutes: cur.focusMinutes,
          label: cur.label,
        });
      }
    }
  }, []);

  const startBreak = useCallback(() => {
    const n = Date.now();
    setNow(n);
    const cur = timerRef.current;
    if (cur.status === "running" && cur.kind === "break") return;

    const b = settingsRef.current.breakMinutes;
    const sessionId = createSessionId(n);
    const scheduleVersion = (cur.scheduleVersion ?? 0) + 1;
    const endAt = n + b * 60000;

    setTimer({
      ...cur,
      kind: "break",
      minutes: b,
      status: "running",
      startedAt: n,
      endAt,
      leftMs: b * 60000,
      sessionId,
      scheduleVersion,
    });

    const np = notificationPrefsRef.current;
    if (np.enabled && np.breakReminders && getPermissionState() === "granted") {
      void showAppNotification(
        buildBreakStartPayload({
          sessionId,
          scheduleVersion,
          minutes: b,
          endAt,
          timezone: np.timezone,
        }),
      );
      void syncSessionScheduleToServer({
        sessionId,
        scheduleVersion,
        kind: "break",
        expectedEndAt: endAt,
        minutes: b,
        label: "Break",
      });
    }
  }, []);

  const pause = useCallback(() => {
    const cur = timerRef.current;
    if (cur.status !== "running") return;
    const leftMsNow = remainingMs(cur.endAt, Date.now());
    const scheduleVersion = (cur.scheduleVersion ?? 0) + 1;
    const sessionId = cur.sessionId || createSessionId(Date.now());

    setTimer({
      ...cur,
      status: "paused",
      leftMs: leftMsNow,
      sessionId,
      scheduleVersion,
    });

    const np = notificationPrefsRef.current;
    if (np.enabled && np.sessionOngoing && getPermissionState() === "granted") {
      void showAppNotification(
        buildFocusPausedPayload({
          sessionId,
          scheduleVersion,
          remainingMinutes: Math.max(1, Math.ceil(leftMsNow / 60000)),
          label: cur.label,
        }),
      );
    }
    void cancelSessionScheduleOnServer({
      sessionId,
      scheduleVersion,
      nextStatus: "paused",
    });
  }, []);

  const resume = useCallback(() => {
    const cur = timerRef.current;
    if (cur.status !== "paused") return;
    const n = Date.now();
    setNow(n);
    const endAt = n + cur.leftMs;
    const scheduleVersion = (cur.scheduleVersion ?? 0) + 1;
    const sessionId = cur.sessionId || createSessionId(n);

    setTimer({
      ...cur,
      status: "running",
      endAt,
      sessionId,
      scheduleVersion,
    });

    const np = notificationPrefsRef.current;
    if (np.enabled && getPermissionState() === "granted") {
      const remMins = Math.max(1, Math.ceil(cur.leftMs / 60000));
      if (cur.kind === "focus" && np.sessionOngoing) {
        void showAppNotification(
          buildFocusStartPayload({
            sessionId,
            scheduleVersion,
            minutes: cur.minutes,
            remainingMinutes: remMins,
            endAt,
            label: cur.label,
            timezone: np.timezone,
          }),
        );
      } else if (cur.kind === "break" && np.breakReminders) {
        void showAppNotification(
          buildBreakStartPayload({
            sessionId,
            scheduleVersion,
            minutes: cur.minutes,
            endAt,
            timezone: np.timezone,
          }),
        );
      }
      if (
        (cur.kind === "focus" && np.sessionCompletion) ||
        (cur.kind === "break" && np.breakReminders)
      ) {
        void syncSessionScheduleToServer({
          sessionId,
          scheduleVersion,
          kind: cur.kind,
          expectedEndAt: endAt,
          minutes: cur.minutes,
          label: cur.label,
        });
      }
    }
  }, []);

  const reset = useCallback(() => {
    const cur = timerRef.current;
    const scheduleVersion = (cur.scheduleVersion ?? 0) + 1;
    void closeAppNotificationsByTag("focus-active-session");
    void cancelSessionScheduleOnServer({
      ...(cur.sessionId ? { sessionId: cur.sessionId } : {}),
      scheduleVersion,
      nextStatus: "idle",
    });
    setTimer((t) => idle(t.focusMinutes, t.label, scheduleVersion));
  }, []);

  const end = useCallback(() => {
    const cur = timerRef.current;
    const scheduleVersion = (cur.scheduleVersion ?? 0) + 1;
    void closeAppNotificationsByTag("focus-active-session");
    void cancelSessionScheduleOnServer({
      ...(cur.sessionId ? { sessionId: cur.sessionId } : {}),
      scheduleVersion,
      nextStatus: "idle",
    });
    setTimer((t) => idle(t.focusMinutes, t.label, scheduleVersion));
  }, []);

  const dismiss = useCallback(() => {
    const cur = timerRef.current;
    setTimer((t) => idle(t.focusMinutes, t.label, (cur.scheduleVersion ?? 0) + 1));
  }, []);

  // Handle notificationclick actions via SW messages and launch URL params
  useEffect(() => {
    if (!ready || typeof window === "undefined") return;

    const handleAction = (action: string) => {
      const cur = timerRef.current;
      if (action === "start_focus") {
        if (cur.status !== "running") {
          start();
        }
      } else if (action === "start_break") {
        if (cur.status !== "running") {
          startBreak();
        }
      }
    };

    const params = new URLSearchParams(window.location.search);
    const launchAction = params.get("action");
    if (launchAction) {
      handleAction(launchAction);
      params.delete("action");
      const nextUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}`;
      window.history.replaceState(null, "", nextUrl);
    }

    const onSwMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; action?: string } | undefined;
      if (!data) return;
      if (data.type === "FOCUS_NOTIFICATION_ACTION" && typeof data.action === "string") {
        handleAction(data.action);
      } else if (data.type === "FOCUS_PUSH_SUBSCRIPTION_CHANGED") {
        void syncNotificationPrefsNow();
      }
    };

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", onSwMessage);
      return () => navigator.serviceWorker.removeEventListener("message", onSwMessage);
    }
    return undefined;
  }, [ready, start, startBreak, syncNotificationPrefsNow]);

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
      selectMinutes: (m) => setTimer((t) => idle(m, t.label, t.scheduleVersion ?? 0)),
      setLabel: (label) => setTimer((t) => ({ ...t, label })),
      start,
      startBreak,
      pause,
      resume,
      reset,
      end,
      dismiss,
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
      notificationPrefs,
      notificationPermission,
      notificationSupport,
      pushSubscribed,
      pushSyncPending,
      notificationSyncError,
      setNotificationPrefs,
      enableCompanionNotifications,
      disableCompanionNotifications,
      syncNotificationPrefsNow,
      sendTestCompanionNotification,
    }),
    [
      ready,
      settings,
      setSettings,
      timer,
      left,
      sessions,
      immersiveManual,
      start,
      startBreak,
      pause,
      resume,
      reset,
      end,
      dismiss,
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
      notificationPrefs,
      notificationPermission,
      notificationSupport,
      pushSubscribed,
      pushSyncPending,
      notificationSyncError,
      setNotificationPrefs,
      enableCompanionNotifications,
      disableCompanionNotifications,
      syncNotificationPrefsNow,
      sendTestCompanionNotification,
    ],
  );

  return <FocusCtx.Provider value={value}>{children}</FocusCtx.Provider>;
}

export function useFocus() {
  const c = useContext(FocusCtx);
  if (!c) throw new Error("useFocus outside FocusProvider");
  return c;
}
