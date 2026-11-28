import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from "firebase/firestore";
import { auth, db, formatUserErrorMessage, handleFirestoreError, OperationType } from "./firebase";
import {
  calculateSessionBaseXp,
  computeLevelInfo,
  computeStreakSummary,
  evaluateAchievements,
  evaluateDailyChallenges,
  isoDayKey,
  isoWeekKey,
  normalizeSession,
  validateSessionSubmission,
  type FocusSessionRecord,
  type PendingSyncItem,
  type SyncStatus,
} from "./gamification";
import type { Session } from "./stats";
import { getApiBaseUrl, isCapacitorNative, resolveApiUrl } from "./capacitor-native";

const SYNC_QUEUE_KEY = "focus.syncQueue";

export function loadSyncQueue(): PendingSyncItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SYNC_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveSyncQueue(queue: PendingSyncItem[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // Ignore storage quota errors
  }
}

export function buildPendingSyncItem(session: FocusSessionRecord): PendingSyncItem {
  return {
    sessionId: session.id,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    minutes: session.minutes,
    label: (session.label ?? "").slice(0, 60),
    dayKey: isoDayKey(session.endedAt),
    weekKey: isoWeekKey(session.endedAt),
    createdAt: Date.now(),
    attempts: 0,
    nextRetryAt: 0,
  };
}

export function enqueuePendingSession(session: FocusSessionRecord): PendingSyncItem[] {
  const queue = loadSyncQueue();
  if (queue.some((q) => q.sessionId === session.id)) {
    return queue;
  }
  const next = [...queue, buildPendingSyncItem(session)].sort((a, b) => a.endedAt - b.endedAt);
  saveSyncQueue(next);
  return next;
}

export function removeFromSyncQueue(sessionId: string): PendingSyncItem[] {
  const queue = loadSyncQueue();
  const next = queue.filter((q) => q.sessionId !== sessionId);
  saveSyncQueue(next);
  return next;
}

export function computeBackoffDelayMs(attempts: number): number {
  const exp = Math.min(5, Math.max(0, attempts));
  return Math.min(60_000, 2000 * Math.pow(2, exp));
}

export async function checkServerConnectivity(timeoutMs = 3500): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return false;

  // Inside a Capacitor APK without an external VITE_API_BASE_URL, there is no local /api/health server.
  if (isCapacitorNative() && !getApiBaseUrl()) {
    return true;
  }

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(resolveApiUrl(`/api/health?t=${Date.now()}`), {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { ok?: boolean };
    return data?.ok === true;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timer);
  }
}

export interface SyncExecutionResult {
  status: SyncStatus;
  syncedCount: number;
  remainingQueue: PendingSyncItem[];
  syncedSessionIds: string[];
  errorMessage?: string;
}

export async function syncPendingSessions(options: {
  uid: string;
  allSessions: Session[];
  dailyGoal: number;
}): Promise<SyncExecutionResult> {
  const queue = loadSyncQueue();
  if (queue.length === 0) {
    return { status: "synced", syncedCount: 0, remainingQueue: [], syncedSessionIds: [] };
  }

  const reachable = await checkServerConnectivity();
  if (!reachable) {
    return {
      status: "offline",
      syncedCount: 0,
      remainingQueue: queue,
      syncedSessionIds: [],
    };
  }

  const currentUser = auth.currentUser;
  if (!currentUser || currentUser.uid !== options.uid) {
    return {
      status: "waiting",
      syncedCount: 0,
      remainingQueue: queue,
      syncedSessionIds: [],
      errorMessage: "Sign in to synchronize your queued sessions.",
    };
  }

  let idToken: string;
  try {
    idToken = await currentUser.getIdToken();
  } catch {
    return {
      status: "failed",
      syncedCount: 0,
      remainingQueue: queue,
      syncedSessionIds: [],
      errorMessage: "Session expired. Please sign in again to sync.",
    };
  }

  const now = Date.now();
  const sortedQueue = [...queue].sort((a, b) => a.endedAt - b.endedAt);
  const remaining: PendingSyncItem[] = [];
  const syncedSessionIds: string[] = [];

  // Load current server profile state
  const profilePath = `user_profiles/${options.uid}`;
  let profileSnap;
  try {
    profileSnap = await getDoc(doc(db, "user_profiles", options.uid));
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, profilePath);
  }

  if (!profileSnap.exists()) {
    return {
      status: "waiting",
      syncedCount: 0,
      remainingQueue: queue,
      syncedSessionIds: [],
      errorMessage: "Profile is still initializing.",
    };
  }

  let profileData = profileSnap.data() as {
    username: string;
    usernameLower: string;
    avatarId: string;
    privacy: string;
    dailyGoal: number;
    totalMinutes: number;
    totalSessions: number;
    xp: number;
    level: number;
    currentStreak: number;
    longestStreak: number;
    lastGoalDayKey: string;
    dailyKey: string;
    dailyMinutes: number;
    weeklyKey: string;
    weeklyMinutes: number;
    lastSessionId: string;
    unlockedAchievementIds: string[];
  };

  // Load user's joined competitions once so synced minutes also update competition standings
  let joinedCompetitions: { competitionId: string; startDayKey?: string; endDayKey?: string }[] =
    [];
  try {
    const userCompsSnap = await getDocs(
      query(collection(db, "user_competitions"), where("userId", "==", options.uid)),
    );
    joinedCompetitions = userCompsSnap.docs.map((d) => ({
      competitionId: String(d.data()["competitionId"]),
    }));
  } catch {
    joinedCompetitions = [];
  }

  const normalizedSessions = options.allSessions.map(normalizeSession);
  const currentDay = isoDayKey(now);
  const currentWeek = isoWeekKey(now);

  for (let idx = 0; idx < sortedQueue.length; idx++) {
    const item = sortedQueue[idx]!;
    if (item.nextRetryAt > now) {
      remaining.push(item);
      continue;
    }

    // Validate locally & on server endpoint
    const localValidation = validateSessionSubmission(item, now);
    if (!localValidation.valid) {
      // Drop permanently invalid entry instead of blocking valid items forever
      continue;
    }

    const shouldCallRemoteValidator = !isCapacitorNative() || Boolean(getApiBaseUrl());
    if (shouldCallRemoteValidator) {
      const validateUrl = resolveApiUrl("/api/sessions/validate");
      try {
        const validateRes = await fetch(validateUrl, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            sessionId: item.sessionId,
            startedAt: item.startedAt,
            endedAt: item.endedAt,
            minutes: item.minutes,
            label: item.label,
          }),
        });

        if (validateRes.status === 401) {
          // Refresh token once on expiry
          idToken = await currentUser.getIdToken(true);
          const retryRes = await fetch(validateUrl, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              authorization: `Bearer ${idToken}`,
            },
            body: JSON.stringify({
              sessionId: item.sessionId,
              startedAt: item.startedAt,
              endedAt: item.endedAt,
              minutes: item.minutes,
              label: item.label,
            }),
          });
          if (!retryRes.ok) {
            throw new Error("Authentication expired during synchronization.");
          }
        } else if (validateRes.status === 400) {
          // Permanently invalid session rejected by server validation
          continue;
        } else if (!validateRes.ok) {
          throw new Error(`Server validation temporarily unavailable (${validateRes.status})`);
        }
      } catch (err) {
        const attempts = item.attempts + 1;
        remaining.push({
          ...item,
          attempts,
          nextRetryAt: Date.now() + computeBackoffDelayMs(attempts),
          lastError: err instanceof Error ? err.message : "Network error",
        });
        continue;
      }
    }

    // Idempotency check: if session already exists on server, skip re-crediting
    const sessionPath = `focus_sessions/${item.sessionId}`;
    try {
      const existingSession = await getDoc(doc(db, "focus_sessions", item.sessionId));
      if (existingSession.exists()) {
        syncedSessionIds.push(item.sessionId);
        continue;
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, sessionPath);
    }

    // Compute updated server-confirmed stats up through this session
    const sessionsUpToHere = normalizedSessions.filter((s) => s.endedAt <= item.endedAt);
    const streak = computeStreakSummary(
      sessionsUpToHere,
      options.dailyGoal || profileData.dailyGoal || 60,
      item.endedAt,
    );

    const existingAchMap: Record<string, number> = {};
    for (const id of profileData.unlockedAchievementIds) existingAchMap[id] = item.endedAt;
    const { newlyUnlocked } = evaluateAchievements(
      sessionsUpToHere,
      options.dailyGoal || profileData.dailyGoal || 60,
      existingAchMap,
      item.endedAt,
    );
    const newlyUnlockedIds = Object.keys(newlyUnlocked);

    const baseXp = calculateSessionBaseXp(item.minutes);
    let bonusXp = 0;

    // Daily goal bonus once per dayKey
    let nextLastGoalDayKey = profileData.lastGoalDayKey;
    if (streak.goalReached && profileData.lastGoalDayKey !== item.dayKey) {
      bonusXp += 30;
      nextLastGoalDayKey = item.dayKey;
    }

    // 7-day streak bonus when reaching a 7-day multiple
    if (
      streak.currentStreak > 0 &&
      streak.currentStreak % 7 === 0 &&
      streak.currentStreak > profileData.currentStreak
    ) {
      bonusXp += 100;
    }

    // Daily challenge completion awards (checked idempotently on server)
    const challenges = evaluateDailyChallenges(
      sessionsUpToHere,
      options.dailyGoal || profileData.dailyGoal || 60,
      item.endedAt,
    );
    const completedChallengesToCreate: { id: string; xpReward: number; docId: string }[] = [];
    for (const ch of challenges) {
      if (!ch.completed) continue;
      const docId = `${options.uid}_${ch.dayKey}_${ch.id}`;
      try {
        const chSnap = await getDoc(doc(db, "user_challenges", docId));
        if (!chSnap.exists()) {
          completedChallengesToCreate.push({ id: ch.id, xpReward: ch.xpReward, docId });
          bonusXp += ch.xpReward;
        }
      } catch {
        // Ignore non-critical challenge check error
      }
    }

    // Cap single-batch XP within security rule limit (minutes + 230)
    const cappedBonus = Math.min(230, bonusXp);
    const sessionXpAwarded = baseXp + cappedBonus;

    const nextTotalMinutes = profileData.totalMinutes + item.minutes;
    const nextTotalSessions = profileData.totalSessions + 1;
    const nextXp = profileData.xp + sessionXpAwarded;
    const nextLevel = computeLevelInfo(nextXp).level;

    const nextDailyMinutes =
      item.dayKey === currentDay
        ? (profileData.dailyKey === currentDay ? profileData.dailyMinutes : 0) + item.minutes
        : profileData.dailyKey === currentDay
          ? profileData.dailyMinutes
          : 0;
    const nextWeeklyMinutes =
      item.weekKey === currentWeek
        ? (profileData.weeklyKey === currentWeek ? profileData.weeklyMinutes : 0) + item.minutes
        : profileData.weeklyKey === currentWeek
          ? profileData.weeklyMinutes
          : 0;

    const nextLongestStreak = Math.max(
      profileData.longestStreak,
      streak.longestStreak,
      streak.currentStreak,
    );
    const mergedAchIds = Array.from(
      new Set([...profileData.unlockedAchievementIds, ...newlyUnlockedIds]),
    ).slice(0, 20);

    const batch = writeBatch(db);

    // 1. Immutable verified session doc
    batch.set(doc(db, "focus_sessions", item.sessionId), {
      sessionId: item.sessionId,
      userId: options.uid,
      startedAt: item.startedAt,
      endedAt: item.endedAt,
      minutes: item.minutes,
      label: item.label,
      dayKey: item.dayKey,
      weekKey: item.weekKey,
      xpAwarded: sessionXpAwarded,
      syncedAt: serverTimestamp(),
    });

    // 2. Profile stats update (atomic with sessionExistsAfter in rules)
    batch.update(doc(db, "user_profiles", options.uid), {
      totalMinutes: nextTotalMinutes,
      totalSessions: nextTotalSessions,
      xp: nextXp,
      level: nextLevel,
      currentStreak: streak.currentStreak,
      longestStreak: nextLongestStreak,
      lastGoalDayKey: nextLastGoalDayKey,
      dailyKey: currentDay,
      dailyMinutes: nextDailyMinutes,
      weeklyKey: currentWeek,
      weeklyMinutes: nextWeeklyMinutes,
      lastSessionId: item.sessionId,
      unlockedAchievementIds: mergedAchIds,
      updatedAt: serverTimestamp(),
    });

    // 3. Leaderboard entry update (atomic with sessionExistsAfter in rules)
    batch.update(doc(db, "leaderboard_entries", options.uid), {
      level: nextLevel,
      currentStreak: streak.currentStreak,
      totalMinutes: nextTotalMinutes,
      totalSessions: nextTotalSessions,
      dailyKey: currentDay,
      dailyMinutes: nextDailyMinutes,
      weeklyKey: currentWeek,
      weeklyMinutes: nextWeeklyMinutes,
      lastSessionId: item.sessionId,
      updatedAt: serverTimestamp(),
    });

    // 4. Newly unlocked achievements (single-grant)
    for (const achId of newlyUnlockedIds) {
      const achDocId = `${options.uid}_${achId}`;
      try {
        const achSnap = await getDoc(doc(db, "user_achievements", achDocId));
        if (!achSnap.exists()) {
          batch.set(doc(db, "user_achievements", achDocId), {
            userId: options.uid,
            achievementId: achId,
            unlockedAt: newlyUnlocked[achId] ?? item.endedAt,
            createdAt: serverTimestamp(),
          });
        }
      } catch {
        // Skip if lookup failed
      }
    }

    // 5. Newly completed daily challenges (single-grant)
    for (const ch of completedChallengesToCreate) {
      batch.set(doc(db, "user_challenges", ch.docId), {
        userId: options.uid,
        dayKey: item.dayKey,
        challengeId: ch.id,
        xpReward: ch.xpReward,
        completedAt: item.endedAt,
        createdAt: serverTimestamp(),
      });
    }

    // 6. Joined private competitions progress
    for (const comp of joinedCompetitions) {
      try {
        const compSnap = await getDoc(doc(db, "competitions", comp.competitionId));
        const memberSnap = await getDoc(
          doc(db, "competitions", comp.competitionId, "members", options.uid),
        );
        if (compSnap.exists() && memberSnap.exists()) {
          const compData = compSnap.data() as { startDayKey: string; endDayKey: string };
          if (item.dayKey >= compData.startDayKey && item.dayKey <= compData.endDayKey) {
            const mData = memberSnap.data() as { totalMinutes: number; sessionsCount: number };
            batch.update(doc(db, "competitions", comp.competitionId, "members", options.uid), {
              totalMinutes: mData.totalMinutes + item.minutes,
              sessionsCount: mData.sessionsCount + 1,
              lastSessionId: item.sessionId,
              updatedAt: serverTimestamp(),
            });
          }
        }
      } catch {
        // Non-critical competition member update
      }
    }

    try {
      await batch.commit();
      syncedSessionIds.push(item.sessionId);
      // Advance local snapshot for next queued item
      profileData = {
        ...profileData,
        totalMinutes: nextTotalMinutes,
        totalSessions: nextTotalSessions,
        xp: nextXp,
        level: nextLevel,
        currentStreak: streak.currentStreak,
        longestStreak: nextLongestStreak,
        lastGoalDayKey: nextLastGoalDayKey,
        dailyKey: currentDay,
        dailyMinutes: nextDailyMinutes,
        weeklyKey: currentWeek,
        weeklyMinutes: nextWeeklyMinutes,
        lastSessionId: item.sessionId,
        unlockedAchievementIds: mergedAchIds,
      };
    } catch (err) {
      const attempts = item.attempts + 1;
      remaining.push({
        ...item,
        attempts,
        nextRetryAt: Date.now() + computeBackoffDelayMs(attempts),
        lastError: formatUserErrorMessage(err, "Sync write failed."),
      });
    }
  }

  saveSyncQueue(remaining);

  if (remaining.length > 0) {
    return {
      status: "failed",
      syncedCount: syncedSessionIds.length,
      remainingQueue: remaining,
      syncedSessionIds,
      errorMessage: remaining[0]?.lastError ?? "Some sessions are waiting to retry.",
    };
  }

  return {
    status: "synced",
    syncedCount: syncedSessionIds.length,
    remainingQueue: [],
    syncedSessionIds,
  };
}
