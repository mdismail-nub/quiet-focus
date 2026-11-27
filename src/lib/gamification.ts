import type { Session } from "./stats";

export type AvatarId =
  "amber" | "forest" | "midnight" | "sunset" | "slate" | "coral" | "sage" | "stone";

export type PrivacySetting = "public" | "friends" | "private";

export type SyncStatus = "offline" | "waiting" | "syncing" | "synced" | "failed";

export interface FocusSessionRecord extends Session {
  id: string;
  startedAt: number;
  endedAt: number;
  minutes: number;
  label?: string;
  synced?: boolean;
  syncedAt?: number;
}

export interface PendingSyncItem {
  sessionId: string;
  startedAt: number;
  endedAt: number;
  minutes: number;
  label: string;
  dayKey: string;
  weekKey: string;
  createdAt: number;
  attempts: number;
  nextRetryAt: number;
  lastError?: string;
}

export const AVATAR_OPTIONS: {
  id: AvatarId;
  label: string;
  bg: string;
  fg: string;
}[] = [
  { id: "amber", label: "Amber", bg: "#E89B4B", fg: "#FFFFFF" },
  { id: "forest", label: "Forest", bg: "#2E5A44", fg: "#FFFFFF" },
  { id: "midnight", label: "Midnight", bg: "#1E2D4D", fg: "#EFF3FA" },
  { id: "sunset", label: "Sunset", bg: "#D85A22", fg: "#FFFFFF" },
  { id: "slate", label: "Slate", bg: "#475569", fg: "#FFFFFF" },
  { id: "coral", label: "Coral", bg: "#D95D70", fg: "#FFFFFF" },
  { id: "sage", label: "Sage", bg: "#5B8C6E", fg: "#FFFFFF" },
  { id: "stone", label: "Stone", bg: "#57534E", fg: "#FFFFFF" },
];

export const LEVELS: { level: number; title: string; minXp: number }[] = [
  { level: 1, title: "Beginner", minXp: 0 },
  { level: 2, title: "Focus Explorer", minXp: 150 },
  { level: 3, title: "Disciplined", minXp: 500 },
  { level: 4, title: "Productivity Master", minXp: 1200 },
  { level: 5, title: "Focus Legend", minXp: 2500 },
];

export const MAX_SESSION_MINUTES = 240;

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function isoDayKey(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function isoWeekKey(t: number): string {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  // ISO week starting Monday
  const day = d.getDay() || 7;
  d.setDate(d.getDate() + 4 - day);
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getFullYear()}-W${pad2(weekNo)}`;
}

export function startOfLocalDay(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function normalizeSession(raw: Session): FocusSessionRecord {
  const endedAt = Number.isFinite(raw.endedAt) ? Math.round(raw.endedAt) : Date.now();
  const minutes = Math.max(1, Math.min(MAX_SESSION_MINUTES, Math.round(raw.minutes || 1)));
  const startedAt =
    typeof raw.startedAt === "number" && Number.isFinite(raw.startedAt) && raw.startedAt < endedAt
      ? Math.round(raw.startedAt)
      : endedAt - minutes * 60000;
  const id =
    typeof raw.id === "string" && /^[a-zA-Z0-9_-]{8,128}$/.test(raw.id)
      ? raw.id
      : `legacy_${endedAt}_${minutes}`;

  return {
    id,
    startedAt,
    endedAt,
    minutes,
    ...(raw.label ? { label: raw.label.slice(0, 60) } : {}),
    ...(raw.synced !== undefined ? { synced: raw.synced } : {}),
    ...(raw.syncedAt !== undefined ? { syncedAt: raw.syncedAt } : {}),
  };
}

export function createSessionId(endedAt: number): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `fs_${endedAt}_${rand}`;
}

export interface SessionValidationResult {
  valid: boolean;
  reason?: string;
}

export function validateSessionSubmission(
  payload: {
    sessionId: string;
    startedAt: number;
    endedAt: number;
    minutes: number;
    label?: string;
  },
  now: number = Date.now(),
): SessionValidationResult {
  if (!payload.sessionId || !/^[a-zA-Z0-9_-]{8,128}$/.test(payload.sessionId)) {
    return { valid: false, reason: "Invalid session identifier" };
  }
  if (
    !Number.isInteger(payload.minutes) ||
    payload.minutes < 1 ||
    payload.minutes > MAX_SESSION_MINUTES
  ) {
    return {
      valid: false,
      reason: `Duration must be between 1 and ${MAX_SESSION_MINUTES} minutes`,
    };
  }
  if (!Number.isFinite(payload.startedAt) || !Number.isFinite(payload.endedAt)) {
    return { valid: false, reason: "Invalid timestamps" };
  }
  if (payload.startedAt <= 1700000000000) {
    return { valid: false, reason: "Start timestamp is too old" };
  }
  if (payload.endedAt <= payload.startedAt) {
    return { valid: false, reason: "Completion time must be after start time" };
  }
  if (payload.endedAt > now + 300_000) {
    return { valid: false, reason: "Completion timestamp cannot be in the future" };
  }
  const elapsed = payload.endedAt - payload.startedAt;
  if (elapsed > 86_400_000) {
    return { valid: false, reason: "Session span exceeds 24-hour maximum" };
  }
  if (elapsed < payload.minutes * 60_000 - 15_000) {
    return { valid: false, reason: "Elapsed time is shorter than claimed focus duration" };
  }
  if (payload.label && payload.label.length > 60) {
    return { valid: false, reason: "Session label exceeds 60 characters" };
  }
  return { valid: true };
}

export function calculateSessionBaseXp(minutes: number): number {
  if (minutes >= 50) return minutes;
  if (minutes >= 25) return minutes;
  if (minutes >= 15) return minutes;
  return Math.max(1, minutes);
}

export interface LevelInfo {
  level: number;
  title: string;
  totalXp: number;
  currentLevelMinXp: number;
  nextLevelMinXp: number | null;
  xpIntoLevel: number;
  xpToNext: number;
  progress: number;
  isMax: boolean;
}

export function computeLevelInfo(totalXp: number): LevelInfo {
  const safeXp = Math.max(0, Math.floor(totalXp));
  let current = LEVELS[0]!;
  let next: (typeof LEVELS)[number] | null = null;

  for (let i = 0; i < LEVELS.length; i++) {
    const lvl = LEVELS[i]!;
    if (safeXp >= lvl.minXp) {
      current = lvl;
      next = LEVELS[i + 1] ?? null;
    }
  }

  if (!next) {
    return {
      level: current.level,
      title: current.title,
      totalXp: safeXp,
      currentLevelMinXp: current.minXp,
      nextLevelMinXp: null,
      xpIntoLevel: safeXp - current.minXp,
      xpToNext: 0,
      progress: 1,
      isMax: true,
    };
  }

  const span = Math.max(1, next.minXp - current.minXp);
  const xpIntoLevel = safeXp - current.minXp;
  return {
    level: current.level,
    title: current.title,
    totalXp: safeXp,
    currentLevelMinXp: current.minXp,
    nextLevelMinXp: next.minXp,
    xpIntoLevel,
    xpToNext: Math.max(0, next.minXp - safeXp),
    progress: Math.min(1, Math.max(0, xpIntoLevel / span)),
    isMax: false,
  };
}

export interface StreakCalendarDay {
  dayKey: string;
  label: string;
  dateNum: number;
  minutes: number;
  completed: boolean;
  isToday: boolean;
  isUpcoming: boolean;
}

export interface StreakSummary {
  currentStreak: number;
  longestStreak: number;
  todayMinutes: number;
  goalReached: boolean;
  goalMinutes: number;
  calendar: StreakCalendarDay[];
  goalDaysKeys: string[];
  sevenDayMilestonesCount: number;
}

export function computeStreakSummary(
  sessions: Session[],
  dailyGoal: number,
  now: number = Date.now(),
): StreakSummary {
  const goal = Math.max(0, Math.round(dailyGoal));
  const threshold = goal > 0 ? goal : 1;

  const byDay = new Map<string, number>();
  for (const s of sessions) {
    const k = isoDayKey(s.endedAt);
    byDay.set(k, (byDay.get(k) ?? 0) + Math.max(0, Math.round(s.minutes)));
  }

  const completedDays = new Set<string>();
  for (const [k, mins] of byDay.entries()) {
    if (mins >= threshold) completedDays.add(k);
  }

  const todayKey = isoDayKey(now);
  const todayMinutes = byDay.get(todayKey) ?? 0;
  const goalReached = todayMinutes >= threshold;

  // Current streak (survives an incomplete today if yesterday was completed)
  let currentStreak = 0;
  const cursor = new Date(startOfLocalDay(now));
  if (!completedDays.has(isoDayKey(cursor.getTime()))) {
    cursor.setDate(cursor.getDate() - 1);
  }
  while (completedDays.has(isoDayKey(cursor.getTime()))) {
    currentStreak++;
    cursor.setDate(cursor.getDate() - 1);
  }

  // Longest streak across all recorded completed days
  const sortedDates = Array.from(completedDays)
    .map((k) => {
      const [y, m, d] = k.split("-").map(Number);
      return new Date(y!, m! - 1, d!).getTime();
    })
    .sort((a, b) => a - b);

  let longestStreak = 0;
  let run = 0;
  let prevDayMs: number | null = null;
  for (const dayMs of sortedDates) {
    if (prevDayMs !== null && Math.round((dayMs - prevDayMs) / 86400000) === 1) {
      run++;
    } else {
      run = 1;
    }
    if (run > longestStreak) longestStreak = run;
    prevDayMs = dayMs;
  }

  // Current week calendar (Monday -> Sunday)
  const todayStart = new Date(startOfLocalDay(now));
  const dayOfWeek = todayStart.getDay() === 0 ? 6 : todayStart.getDay() - 1; // Mon=0..Sun=6
  const monday = new Date(todayStart);
  monday.setDate(todayStart.getDate() - dayOfWeek);

  const calendar: StreakCalendarDay[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const k = isoDayKey(d.getTime());
    const mins = byDay.get(k) ?? 0;
    const isToday = k === todayKey;
    const isUpcoming = d.getTime() > todayStart.getTime();
    calendar.push({
      dayKey: k,
      label: d.toLocaleDateString(undefined, { weekday: "narrow" }),
      dateNum: d.getDate(),
      minutes: mins,
      completed: !isUpcoming && mins >= threshold,
      isToday,
      isUpcoming,
    });
  }

  const goalDaysKeys = Array.from(completedDays).sort();
  const sevenDayMilestonesCount = Math.floor(longestStreak / 7);

  return {
    currentStreak,
    longestStreak: Math.max(longestStreak, currentStreak),
    todayMinutes,
    goalReached,
    goalMinutes: threshold,
    calendar,
    goalDaysKeys,
    sevenDayMilestonesCount,
  };
}

export interface AchievementDef {
  id: string;
  title: string;
  description: string;
  target: number;
  unit: string;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: "first_focus",
    title: "First Focus",
    description: "Complete your first focus session.",
    target: 1,
    unit: "session",
  },
  {
    id: "early_bird",
    title: "Early Bird",
    description: "Complete a focus session before 7 AM.",
    target: 1,
    unit: "session",
  },
  {
    id: "night_owl",
    title: "Night Owl",
    description: "Complete a focus session after 10 PM.",
    target: 1,
    unit: "session",
  },
  {
    id: "deep_worker",
    title: "Deep Worker",
    description: "Achieve 120 focus minutes in one day.",
    target: 120,
    unit: "min",
  },
  {
    id: "consistency_king",
    title: "Consistency King",
    description: "Maintain a 7-day focus streak.",
    target: 7,
    unit: "days",
  },
  {
    id: "focus_legend",
    title: "Focus Legend",
    description: "Accumulate 100 total focus hours.",
    target: 6000,
    unit: "min",
  },
  {
    id: "marathon",
    title: "Marathon",
    description: "Complete four focus sessions in one day.",
    target: 4,
    unit: "sessions",
  },
  {
    id: "century_club",
    title: "Century Club",
    description: "Complete 100 focus sessions.",
    target: 100,
    unit: "sessions",
  },
];

export interface AchievementStatus extends AchievementDef {
  unlocked: boolean;
  unlockedAt: number | null;
  progress: number;
  progressPct: number;
}

export function evaluateAchievements(
  sessions: Session[],
  dailyGoal: number,
  persistedUnlocks: Record<string, number> = {},
  now: number = Date.now(),
): { achievements: AchievementStatus[]; newlyUnlocked: Record<string, number> } {
  const sorted = [...sessions].sort((a, b) => a.endedAt - b.endedAt);
  const byDayMinutes = new Map<string, number>();
  const byDaySessions = new Map<string, number>();

  let totalMinutes = 0;
  let firstSessionAt: number | null = null;
  let earlyBirdAt: number | null = null;
  let nightOwlAt: number | null = null;
  let deepWorkerAt: number | null = null;
  let marathonAt: number | null = null;
  let focusLegendAt: number | null = null;
  let centuryAt: number | null = null;

  let maxDayMinutes = 0;
  let maxDaySessions = 0;

  for (let i = 0; i < sorted.length; i++) {
    const s = sorted[i]!;
    const mins = Math.max(0, Math.round(s.minutes));
    totalMinutes += mins;
    if (firstSessionAt === null) firstSessionAt = s.endedAt;
    if (i + 1 >= 100 && centuryAt === null) centuryAt = s.endedAt;
    if (totalMinutes >= 6000 && focusLegendAt === null) focusLegendAt = s.endedAt;

    const d = new Date(s.endedAt);
    const hr = d.getHours();
    if (hr < 7 && earlyBirdAt === null) earlyBirdAt = s.endedAt;
    if (hr >= 22 && nightOwlAt === null) nightOwlAt = s.endedAt;

    const k = isoDayKey(s.endedAt);
    const dayMins = (byDayMinutes.get(k) ?? 0) + mins;
    byDayMinutes.set(k, dayMins);
    if (dayMins > maxDayMinutes) maxDayMinutes = dayMins;
    if (dayMins >= 120 && deepWorkerAt === null) deepWorkerAt = s.endedAt;

    const dayCnt = (byDaySessions.get(k) ?? 0) + 1;
    byDaySessions.set(k, dayCnt);
    if (dayCnt > maxDaySessions) maxDaySessions = dayCnt;
    if (dayCnt >= 4 && marathonAt === null) marathonAt = s.endedAt;
  }

  const streakInfo = computeStreakSummary(sorted, dailyGoal, now);
  const bestStreak = Math.max(streakInfo.currentStreak, streakInfo.longestStreak);

  const computedUnlocks: Record<string, { progress: number; unlockedAt: number | null }> = {
    first_focus: { progress: Math.min(1, sorted.length), unlockedAt: firstSessionAt },
    early_bird: { progress: earlyBirdAt ? 1 : 0, unlockedAt: earlyBirdAt },
    night_owl: { progress: nightOwlAt ? 1 : 0, unlockedAt: nightOwlAt },
    deep_worker: { progress: Math.min(120, maxDayMinutes), unlockedAt: deepWorkerAt },
    consistency_king: {
      progress: Math.min(7, bestStreak),
      unlockedAt: bestStreak >= 7 ? (sorted.at(-1)?.endedAt ?? now) : null,
    },
    focus_legend: { progress: Math.min(6000, totalMinutes), unlockedAt: focusLegendAt },
    marathon: { progress: Math.min(4, maxDaySessions), unlockedAt: marathonAt },
    century_club: { progress: Math.min(100, sorted.length), unlockedAt: centuryAt },
  };

  const newlyUnlocked: Record<string, number> = {};
  const achievements: AchievementStatus[] = ACHIEVEMENTS.map((def) => {
    const existingAt = persistedUnlocks[def.id] ?? null;
    const computed = computedUnlocks[def.id]!;
    const unlockedAt = existingAt ?? computed.unlockedAt;
    const unlocked = unlockedAt !== null;
    if (existingAt === null && computed.unlockedAt !== null) {
      newlyUnlocked[def.id] = computed.unlockedAt;
    }
    const progress = unlocked ? def.target : Math.min(def.target, computed.progress);
    return {
      ...def,
      unlocked,
      unlockedAt,
      progress,
      progressPct: Math.min(100, Math.round((progress / def.target) * 100)),
    };
  });

  return { achievements, newlyUnlocked };
}

export interface DailyChallengeStatus {
  id: string;
  dayKey: string;
  title: string;
  description: string;
  progress: number;
  target: number;
  completed: boolean;
  xpReward: number;
}

export function evaluateDailyChallenges(
  sessions: Session[],
  dailyGoal: number,
  now: number = Date.now(),
): DailyChallengeStatus[] {
  const todayKey = isoDayKey(now);
  const yesterdayMs = startOfLocalDay(now) - 86400000;
  const yesterdayKey = isoDayKey(yesterdayMs);

  const todaySessions = sessions.filter((s) => isoDayKey(s.endedAt) === todayKey);
  const todayMinutes = todaySessions.reduce(
    (sum, s) => sum + Math.max(0, Math.round(s.minutes)),
    0,
  );
  const maxSingleToday = todaySessions.reduce((max, s) => Math.max(max, Math.round(s.minutes)), 0);
  const yesterdayMinutes = sessions
    .filter((s) => isoDayKey(s.endedAt) === yesterdayKey)
    .reduce((sum, s) => sum + Math.max(0, Math.round(s.minutes)), 0);

  const streak = computeStreakSummary(sessions, dailyGoal, now).currentStreak;
  const beatTarget = yesterdayMinutes > 0 ? yesterdayMinutes + 1 : 25;

  return [
    {
      id: "focus_60_today",
      dayKey: todayKey,
      title: "Focus for 60 minutes today",
      description: "Accumulate an hour of focused work before midnight.",
      progress: Math.min(60, todayMinutes),
      target: 60,
      completed: todayMinutes >= 60,
      xpReward: 30,
    },
    {
      id: "three_sessions_today",
      dayKey: todayKey,
      title: "Complete three focus sessions",
      description: "Build momentum with three finished sessions today.",
      progress: Math.min(3, todaySessions.length),
      target: 3,
      completed: todaySessions.length >= 3,
      xpReward: 25,
    },
    {
      id: "deep_50_session",
      dayKey: todayKey,
      title: "Uninterrupted 50-minute block",
      description: "Finish at least one 50-minute session today.",
      progress: Math.min(50, maxSingleToday),
      target: 50,
      completed: maxSingleToday >= 50,
      xpReward: 35,
    },
    {
      id: "beat_yesterday",
      dayKey: todayKey,
      title: "Beat yesterday's focus time",
      description:
        yesterdayMinutes > 0
          ? `Surpass yesterday's ${yesterdayMinutes} minutes.`
          : "Reach at least 25 minutes to set a benchmark.",
      progress: Math.min(beatTarget, todayMinutes),
      target: beatTarget,
      completed: todayMinutes >= beatTarget,
      xpReward: 30,
    },
    {
      id: "five_day_streak",
      dayKey: todayKey,
      title: "Maintain a five-day streak",
      description: "Keep your daily focus goal streak at 5 days or higher.",
      progress: Math.min(5, streak),
      target: 5,
      completed: streak >= 5,
      xpReward: 40,
    },
  ];
}

export interface GamificationSummary {
  totalXp: number;
  levelInfo: LevelInfo;
  streak: StreakSummary;
  achievements: AchievementStatus[];
  challenges: DailyChallengeStatus[];
  recentRewards: { id: string; label: string; xp: number; at: number }[];
}

export function computeGamificationSummary(
  sessions: Session[],
  dailyGoal: number,
  persistedAchievementUnlocks: Record<string, number> = {},
  claimedChallengeKeys: string[] = [],
  now: number = Date.now(),
): GamificationSummary {
  const normalized = sessions.map(normalizeSession).sort((a, b) => a.endedAt - b.endedAt);
  const streak = computeStreakSummary(normalized, dailyGoal, now);
  const { achievements } = evaluateAchievements(
    normalized,
    dailyGoal,
    persistedAchievementUnlocks,
    now,
  );
  const challenges = evaluateDailyChallenges(normalized, dailyGoal, now);

  // Base XP from completed sessions
  let totalXp = 0;
  const recentRewards: { id: string; label: string; xp: number; at: number }[] = [];

  for (const s of normalized) {
    const base = calculateSessionBaseXp(s.minutes);
    totalXp += base;
    recentRewards.push({
      id: `sess_${s.id}`,
      label: s.label ? `${s.minutes}m · ${s.label}` : `${s.minutes}m focus session`,
      xp: base,
      at: s.endedAt,
    });
  }

  // Daily focus goal bonus: +30 XP once per completed goal day
  const goalBonusXp = streak.goalDaysKeys.length * 30;
  totalXp += goalBonusXp;
  if (streak.goalReached) {
    recentRewards.push({
      id: `goal_${isoDayKey(now)}`,
      label: "Daily focus goal reached",
      xp: 30,
      at: normalized.at(-1)?.endedAt ?? now,
    });
  }

  // 7-day streak milestone bonus: +100 XP per 7-day milestone achieved
  const streakBonusXp = streak.sevenDayMilestonesCount * 100;
  totalXp += streakBonusXp;
  if (
    streak.sevenDayMilestonesCount > 0 &&
    streak.currentStreak >= 7 &&
    streak.currentStreak % 7 === 0
  ) {
    recentRewards.push({
      id: `streak7_${isoDayKey(now)}`,
      label: `${streak.currentStreak}-day streak milestone`,
      xp: 100,
      at: normalized.at(-1)?.endedAt ?? now,
    });
  }

  // Daily challenge XP (for completed challenges + any historically claimed keys)
  const challengeRewardById = new Map(challenges.map((c) => [c.id, c.xpReward]));
  const countedChallengeKeys = new Set<string>(claimedChallengeKeys);
  for (const c of challenges) {
    if (c.completed) countedChallengeKeys.add(`${c.dayKey}_${c.id}`);
  }
  for (const key of countedChallengeKeys) {
    const parts = key.split("_");
    const cid = parts.slice(1).join("_");
    const reward = challengeRewardById.get(cid) ?? 30;
    totalXp += reward;
  }
  for (const c of challenges) {
    if (c.completed) {
      recentRewards.push({
        id: `chal_${c.dayKey}_${c.id}`,
        label: `Challenge: ${c.title}`,
        xp: c.xpReward,
        at: now,
      });
    }
  }

  const levelInfo = computeLevelInfo(totalXp);
  const sortedRewards = recentRewards.sort((a, b) => b.at - a.at).slice(0, 6);

  return {
    totalXp,
    levelInfo,
    streak,
    achievements,
    challenges,
    recentRewards: sortedRewards,
  };
}

export type AnalyticsTimeframe = "daily" | "weekly" | "monthly" | "yearly";

export interface AnalyticsPoint {
  label: string;
  minutes: number;
  sessions: number;
  isCurrent: boolean;
}

export interface AnalyticsSummary {
  todayMinutes: number;
  weekMinutes: number;
  monthMinutes: number;
  lifetimeMinutes: number;
  totalSessions: number;
  averageDailyMinutes: number;
  longestSessionMinutes: number;
  mostProductiveDay: string;
  mostProductiveTimeOfDay: string;
  series: Record<AnalyticsTimeframe, AnalyticsPoint[]>;
}

export function computeAnalytics(sessions: Session[], now: number = Date.now()): AnalyticsSummary {
  const todayKey = isoDayKey(now);
  const currentWeek = isoWeekKey(now);
  const nowDate = new Date(now);
  const currentMonthPrefix = `${nowDate.getFullYear()}-${pad2(nowDate.getMonth() + 1)}`;

  let todayMinutes = 0;
  let weekMinutes = 0;
  let monthMinutes = 0;
  let lifetimeMinutes = 0;
  let longestSessionMinutes = 0;

  const dayTotals = new Map<string, { minutes: number; sessions: number }>();
  const weekTotals = new Map<string, { minutes: number; sessions: number }>();
  const monthTotals = new Map<string, { minutes: number; sessions: number }>();
  const weekdayTotals = [0, 0, 0, 0, 0, 0, 0];
  const bucketTotals = {
    morning: 0, // 5 - 11
    afternoon: 0, // 12 - 16
    evening: 0, // 17 - 20
    night: 0, // 21 - 4
  };

  for (const s of sessions) {
    const mins = Math.max(0, Math.round(s.minutes));
    lifetimeMinutes += mins;
    if (mins > longestSessionMinutes) longestSessionMinutes = mins;

    const dk = isoDayKey(s.endedAt);
    const wk = isoWeekKey(s.endedAt);
    const d = new Date(s.endedAt);
    const mk = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;

    if (dk === todayKey) todayMinutes += mins;
    if (wk === currentWeek) weekMinutes += mins;
    if (mk === currentMonthPrefix) monthMinutes += mins;

    const prevDay = dayTotals.get(dk) ?? { minutes: 0, sessions: 0 };
    dayTotals.set(dk, { minutes: prevDay.minutes + mins, sessions: prevDay.sessions + 1 });

    const prevWeek = weekTotals.get(wk) ?? { minutes: 0, sessions: 0 };
    weekTotals.set(wk, { minutes: prevWeek.minutes + mins, sessions: prevWeek.sessions + 1 });

    const prevMonth = monthTotals.get(mk) ?? { minutes: 0, sessions: 0 };
    monthTotals.set(mk, { minutes: prevMonth.minutes + mins, sessions: prevMonth.sessions + 1 });

    weekdayTotals[d.getDay()] = (weekdayTotals[d.getDay()] ?? 0) + mins;

    const hr = d.getHours();
    if (hr >= 5 && hr < 12) bucketTotals.morning += mins;
    else if (hr >= 12 && hr < 17) bucketTotals.afternoon += mins;
    else if (hr >= 17 && hr < 21) bucketTotals.evening += mins;
    else bucketTotals.night += mins;
  }

  const activeDays = Math.max(1, dayTotals.size);
  const averageDailyMinutes = sessions.length > 0 ? Math.round(lifetimeMinutes / activeDays) : 0;

  const weekdayNames = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  let bestDayIdx = 0;
  for (let i = 1; i < 7; i++) {
    if (weekdayTotals[i]! > weekdayTotals[bestDayIdx]!) bestDayIdx = i;
  }
  const mostProductiveDay = sessions.length > 0 ? weekdayNames[bestDayIdx]! : "—";

  const bucketLabels: Record<keyof typeof bucketTotals, string> = {
    morning: "Morning (5 AM–12 PM)",
    afternoon: "Afternoon (12–5 PM)",
    evening: "Evening (5–9 PM)",
    night: "Night (9 PM–5 AM)",
  };
  let bestBucket: keyof typeof bucketTotals = "morning";
  for (const k of Object.keys(bucketTotals) as (keyof typeof bucketTotals)[]) {
    if (bucketTotals[k] > bucketTotals[bestBucket]) bestBucket = k;
  }
  const mostProductiveTimeOfDay = sessions.length > 0 ? bucketLabels[bestBucket] : "—";

  // Daily series: last 7 days
  const dailySeries: AnalyticsPoint[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(startOfLocalDay(now));
    d.setDate(d.getDate() - i);
    const dk = isoDayKey(d.getTime());
    const entry = dayTotals.get(dk) ?? { minutes: 0, sessions: 0 };
    dailySeries.push({
      label: d.toLocaleDateString(undefined, { weekday: "short" }),
      minutes: entry.minutes,
      sessions: entry.sessions,
      isCurrent: i === 0,
    });
  }

  // Weekly series: last 8 weeks
  const weeklySeries: AnalyticsPoint[] = [];
  for (let i = 7; i >= 0; i--) {
    const d = new Date(startOfLocalDay(now));
    d.setDate(d.getDate() - i * 7);
    const wk = isoWeekKey(d.getTime());
    const entry = weekTotals.get(wk) ?? { minutes: 0, sessions: 0 };
    weeklySeries.push({
      label: i === 0 ? "This wk" : `W-${i}`,
      minutes: entry.minutes,
      sessions: entry.sessions,
      isCurrent: i === 0,
    });
  }

  // Monthly series: last 30 days grouped into 15 two-day or 30 daily points -> last 14 days for crisp minimal bars, or 6 months
  const monthlySeries: AnalyticsPoint[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(startOfLocalDay(now));
    d.setDate(d.getDate() - i);
    const dk = isoDayKey(d.getTime());
    const entry = dayTotals.get(dk) ?? { minutes: 0, sessions: 0 };
    monthlySeries.push({
      label: `${d.getMonth() + 1}/${d.getDate()}`,
      minutes: entry.minutes,
      sessions: entry.sessions,
      isCurrent: i === 0,
    });
  }

  // Yearly series: 12 months of current year
  const yearlySeries: AnalyticsPoint[] = [];
  const yr = nowDate.getFullYear();
  for (let m = 0; m < 12; m++) {
    const d = new Date(yr, m, 1);
    const mk = `${yr}-${pad2(m + 1)}`;
    const entry = monthTotals.get(mk) ?? { minutes: 0, sessions: 0 };
    yearlySeries.push({
      label: d.toLocaleDateString(undefined, { month: "short" }),
      minutes: entry.minutes,
      sessions: entry.sessions,
      isCurrent: m === nowDate.getMonth(),
    });
  }

  return {
    todayMinutes,
    weekMinutes,
    monthMinutes,
    lifetimeMinutes,
    totalSessions: sessions.length,
    averageDailyMinutes,
    longestSessionMinutes,
    mostProductiveDay,
    mostProductiveTimeOfDay,
    series: {
      daily: dailySeries,
      weekly: weeklySeries,
      monthly: monthlySeries,
      yearly: yearlySeries,
    },
  };
}

export function sanitizeUsernameInput(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 24);
}

export function isValidUsernameFormat(username: string): boolean {
  return /^[a-zA-Z0-9_]{3,24}$/.test(username);
}

export function defaultUsernameFromUser(
  displayName?: string | null,
  email?: string | null,
  uid?: string,
): string {
  const candidate =
    displayName?.trim() || email?.split("@")[0]?.trim() || `focus_${(uid ?? "user").slice(0, 6)}`;
  const cleaned = sanitizeUsernameInput(candidate);
  if (cleaned.length >= 3) return cleaned;
  return `focus_${(uid ?? "user").slice(0, 6)}`.slice(0, 24);
}
