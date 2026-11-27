import test from "node:test";
import assert from "node:assert/strict";
import {
  ACHIEVEMENTS,
  calculateSessionBaseXp,
  computeAnalytics,
  computeGamificationSummary,
  computeLevelInfo,
  computeStreakSummary,
  createSessionId,
  defaultUsernameFromUser,
  evaluateAchievements,
  evaluateDailyChallenges,
  isValidUsernameFormat,
  isoDayKey,
  normalizeSession,
  sanitizeUsernameInput,
  validateSessionSubmission,
} from "../src/lib/gamification";

const DAY_MS = 86_400_000;
const BASE_NOW = new Date(2026, 10, 27, 14, 0, 0).getTime();

test("normalizeSession assigns unique deterministic legacy IDs and clamps duration", () => {
  const s = normalizeSession({ endedAt: BASE_NOW, minutes: 300, label: "Deep work" });
  assert.equal(s.minutes, 240);
  assert.equal(s.startedAt, BASE_NOW - 240 * 60_000);
  assert.match(s.id, /^legacy_/);
});

test("createSessionId produces valid session identifiers", () => {
  const id = createSessionId(BASE_NOW);
  assert.match(id, /^fs_[0-9]+_[a-z0-9]+$/);
});

test("validateSessionSubmission enforces bounds and rejects tampered payloads", () => {
  const valid = validateSessionSubmission(
    {
      sessionId: "fs_1795816800000_abc123",
      startedAt: BASE_NOW - 25 * 60_000,
      endedAt: BASE_NOW,
      minutes: 25,
      label: "Writing",
    },
    BASE_NOW,
  );
  assert.equal(valid.valid, true);

  // Supports paused spans up to 24h
  const pausedValid = validateSessionSubmission(
    {
      sessionId: "fs_1795816800000_paused1",
      startedAt: BASE_NOW - 120 * 60_000,
      endedAt: BASE_NOW,
      minutes: 25,
    },
    BASE_NOW,
  );
  assert.equal(pausedValid.valid, true);

  // Rejects >240 minutes
  assert.equal(
    validateSessionSubmission(
      {
        sessionId: "fs_1795816800000_over1",
        startedAt: BASE_NOW - 250 * 60_000,
        endedAt: BASE_NOW,
        minutes: 250,
      },
      BASE_NOW,
    ).valid,
    false,
  );

  // Rejects future completion
  assert.equal(
    validateSessionSubmission(
      {
        sessionId: "fs_1795816800000_fut1",
        startedAt: BASE_NOW,
        endedAt: BASE_NOW + 600_000,
        minutes: 25,
      },
      BASE_NOW,
    ).valid,
    false,
  );

  // Rejects elapsed shorter than claimed minutes
  assert.equal(
    validateSessionSubmission(
      {
        sessionId: "fs_1795816800000_short1",
        startedAt: BASE_NOW - 5 * 60_000,
        endedAt: BASE_NOW,
        minutes: 25,
      },
      BASE_NOW,
    ).valid,
    false,
  );
});

test("XP rules and 5-level progression match specification", () => {
  assert.equal(calculateSessionBaseXp(15), 15);
  assert.equal(calculateSessionBaseXp(25), 25);
  assert.equal(calculateSessionBaseXp(50), 50);

  assert.equal(computeLevelInfo(0).level, 1);
  assert.equal(computeLevelInfo(0).title, "Beginner");
  assert.equal(computeLevelInfo(150).level, 2);
  assert.equal(computeLevelInfo(150).title, "Focus Explorer");
  assert.equal(computeLevelInfo(500).level, 3);
  assert.equal(computeLevelInfo(500).title, "Disciplined");
  assert.equal(computeLevelInfo(1200).level, 4);
  assert.equal(computeLevelInfo(1200).title, "Productivity Master");
  assert.equal(computeLevelInfo(2500).level, 5);
  assert.equal(computeLevelInfo(2500).title, "Focus Legend");
  assert.equal(computeLevelInfo(2500).isMax, true);
});

test("computeStreakSummary tracks consecutive goal days, weekly calendar, and 7-day milestones", () => {
  const sessions = Array.from({ length: 7 }, (_, i) => ({
    endedAt: BASE_NOW - i * DAY_MS,
    minutes: 60,
  }));

  const streak = computeStreakSummary(sessions, 60, BASE_NOW);
  assert.equal(streak.currentStreak, 7);
  assert.equal(streak.longestStreak, 7);
  assert.equal(streak.goalReached, true);
  assert.equal(streak.sevenDayMilestonesCount, 1);
  assert.equal(streak.calendar.length, 7);
  assert.equal(streak.calendar.filter((d) => d.isToday).length, 1);
});

test("evaluateAchievements covers all 8 badges and enforces single-grant", () => {
  assert.equal(ACHIEVEMENTS.length, 8);

  const morning = new Date(2026, 10, 27, 6, 30, 0).getTime();
  const night = new Date(2026, 10, 27, 22, 30, 0).getTime();
  const sessions = [
    { endedAt: morning, minutes: 30 },
    { endedAt: morning + 3_600_000, minutes: 30 },
    { endedAt: morning + 7_200_000, minutes: 30 },
    { endedAt: night, minutes: 35 }, // 125m today, 4 sessions today, early bird & night owl
  ];

  const firstPass = evaluateAchievements(sessions, 60, {}, night);
  const byId = new Map(firstPass.achievements.map((a) => [a.id, a]));
  assert.equal(byId.get("first_focus")?.unlocked, true);
  assert.equal(byId.get("early_bird")?.unlocked, true);
  assert.equal(byId.get("night_owl")?.unlocked, true);
  assert.equal(byId.get("deep_worker")?.unlocked, true);
  assert.equal(byId.get("marathon")?.unlocked, true);
  assert.equal(byId.get("consistency_king")?.unlocked, false);

  // Second pass with persisted unlocks should not double-grant
  const secondPass = evaluateAchievements(sessions, 60, firstPass.newlyUnlocked, night);
  assert.equal(Object.keys(secondPass.newlyUnlocked).length, 0);
});

test("evaluateDailyChallenges awards completion accurately and computeGamificationSummary prevents duplicate goal XP", () => {
  const yesterday = BASE_NOW - DAY_MS;
  const sessions = [
    { id: "fs_y_1", startedAt: yesterday - 25 * 60_000, endedAt: yesterday, minutes: 25 },
    { id: "fs_t_1", startedAt: BASE_NOW - 50 * 60_000, endedAt: BASE_NOW, minutes: 50 },
    { id: "fs_t_2", startedAt: BASE_NOW + 60_000, endedAt: BASE_NOW + 16 * 60_000, minutes: 15 },
    {
      id: "fs_t_3",
      startedAt: BASE_NOW + 20 * 60_000,
      endedAt: BASE_NOW + 35 * 60_000,
      minutes: 15,
    },
  ];

  const nowAfter = BASE_NOW + 36 * 60_000;
  const challenges = evaluateDailyChallenges(sessions, 60, nowAfter);
  const map = new Map(challenges.map((c) => [c.id, c]));
  assert.equal(map.get("focus_60_today")?.completed, true);
  assert.equal(map.get("three_sessions_today")?.completed, true);
  assert.equal(map.get("deep_50_session")?.completed, true);
  assert.equal(map.get("beat_yesterday")?.completed, true);
  assert.equal(map.get("five_day_streak")?.completed, false);

  const summary = computeGamificationSummary(sessions, 60, {}, [], nowAfter);
  // Base XP: 25 + 50 + 15 + 15 = 105
  // Goal bonus: 1 day >= 60m = +30
  // Challenges completed: 30 + 25 + 35 + 30 = +120
  // Total = 255
  assert.equal(summary.totalXp, 255);
  assert.equal(summary.levelInfo.level, 2);

  // Adding already-claimed keys for completed today challenges must NOT double-count
  const todayKey = isoDayKey(nowAfter);
  const summaryWithClaimed = computeGamificationSummary(
    sessions,
    60,
    {},
    [`${todayKey}_focus_60_today`, `${todayKey}_three_sessions_today`],
    nowAfter,
  );
  assert.equal(summaryWithClaimed.totalXp, 255);
});

test("computeAnalytics builds daily, weekly, monthly, and yearly series plus insights", () => {
  const sessions = [
    { endedAt: new Date(2026, 10, 27, 9, 30, 0).getTime(), minutes: 50 },
    { endedAt: new Date(2026, 10, 27, 10, 45, 0).getTime(), minutes: 25 },
    { endedAt: new Date(2026, 10, 26, 15, 0, 0).getTime(), minutes: 40 },
  ];

  const analytics = computeAnalytics(sessions, BASE_NOW);
  assert.equal(analytics.todayMinutes, 75);
  assert.equal(analytics.lifetimeMinutes, 115);
  assert.equal(analytics.totalSessions, 3);
  assert.equal(analytics.longestSessionMinutes, 50);
  assert.equal(analytics.mostProductiveDay, "Friday");
  assert.equal(analytics.mostProductiveTimeOfDay, "Morning (5 AM–12 PM)");
  assert.equal(analytics.series.daily.length, 7);
  assert.equal(analytics.series.weekly.length, 8);
  assert.equal(analytics.series.monthly.length, 14);
  assert.equal(analytics.series.yearly.length, 12);
});

test("username helpers sanitize and validate correctly", () => {
  assert.equal(sanitizeUsernameInput("Alex Focus!@#99"), "AlexFocus99");
  assert.equal(isValidUsernameFormat("AlexFocus_99"), true);
  assert.equal(isValidUsernameFormat("ab"), false);
  assert.equal(defaultUsernameFromUser("  ", "alex@example.com", "uid123456"), "alex");
  assert.equal(defaultUsernameFromUser("  ", "a@example.com", "uid123456"), "focus_uid123");
});
