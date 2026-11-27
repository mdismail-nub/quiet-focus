import { beforeEach, describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { createRouter, rootRouteId } from "@tanstack/react-router";
import { routeTree } from "@/routeTree.gen";
import {
  calculateSessionBaseXp,
  computeAnalytics,
  computeGamificationSummary,
  computeLevelInfo,
  computeStreakSummary,
  evaluateAchievements,
  evaluateDailyChallenges,
  normalizeSession,
  validateSessionSubmission,
} from "@/lib/gamification";
import { formatFirebaseAuthError } from "@/lib/firebase";
import {
  computeBackoffDelayMs,
  enqueuePendingSession,
  loadSyncQueue,
  removeFromSyncQueue,
} from "@/lib/sync-service";

const DAY_MS = 86_400_000;
const NOW = new Date(2026, 10, 27, 15, 0, 0).getTime();

describe("Gamification, Offline Sync Queue & Extended Routing", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("matches /leaderboard and /social routes in the generated router tree", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
    for (const path of ["/", "/progress", "/leaderboard", "/social", "/settings"]) {
      const matches = router.matchRoutes(path);
      expect(matches.at(-1)?.routeId).not.toBe(rootRouteId);
    }
  });

  it("persists offline sync queue in localStorage without duplicates and computes exponential backoff", () => {
    const session = normalizeSession({
      id: "fs_offline_001",
      startedAt: NOW - 25 * 60_000,
      endedAt: NOW,
      minutes: 25,
      label: "Offline deep focus",
      synced: false,
    });

    const q1 = enqueuePendingSession(session);
    expect(q1).toHaveLength(1);
    expect(q1[0]?.sessionId).toBe("fs_offline_001");

    // Duplicate enqueue with same sessionId must be idempotent
    const q2 = enqueuePendingSession(session);
    expect(q2).toHaveLength(1);
    expect(loadSyncQueue()).toHaveLength(1);

    const q3 = removeFromSyncQueue("fs_offline_001");
    expect(q3).toHaveLength(0);

    expect(computeBackoffDelayMs(0)).toBe(2000);
    expect(computeBackoffDelayMs(1)).toBe(4000);
    expect(computeBackoffDelayMs(2)).toBe(8000);
    expect(computeBackoffDelayMs(10)).toBe(60000);
  });

  it("validates session payloads and rejects implausible durations or timestamps", () => {
    expect(
      validateSessionSubmission(
        {
          sessionId: "fs_valid_12345",
          startedAt: NOW - 50 * 60_000,
          endedAt: NOW,
          minutes: 50,
          label: "Architecture",
        },
        NOW,
      ).valid,
    ).toBe(true);

    expect(
      validateSessionSubmission(
        {
          sessionId: "fs_bad_minutes",
          startedAt: NOW - 300 * 60_000,
          endedAt: NOW,
          minutes: 241,
        },
        NOW,
      ).valid,
    ).toBe(false);

    expect(
      validateSessionSubmission(
        {
          sessionId: "bad",
          startedAt: NOW - 25 * 60_000,
          endedAt: NOW,
          minutes: 25,
        },
        NOW,
      ).valid,
    ).toBe(false);
  });

  it("computes XP, 5 levels, streaks, achievements, daily challenges, and analytics accurately", () => {
    expect(calculateSessionBaseXp(15)).toBe(15);
    expect(calculateSessionBaseXp(25)).toBe(25);
    expect(calculateSessionBaseXp(50)).toBe(50);
    expect(computeLevelInfo(2600).level).toBe(5);

    const streakSessions = Array.from({ length: 7 }, (_, i) => ({
      endedAt: NOW - i * DAY_MS,
      minutes: 60,
    }));
    const streak = computeStreakSummary(streakSessions, 60, NOW);
    expect(streak.currentStreak).toBe(7);
    expect(streak.sevenDayMilestonesCount).toBe(1);

    const { achievements } = evaluateAchievements(streakSessions, 60, {}, NOW);
    expect(achievements.find((a) => a.id === "consistency_king")?.unlocked).toBe(true);

    const challenges = evaluateDailyChallenges(streakSessions, 60, NOW);
    expect(challenges.find((c) => c.id === "five_day_streak")?.completed).toBe(true);

    const summary = computeGamificationSummary(streakSessions, 60, {}, [], NOW);
    expect(summary.totalXp).toBeGreaterThan(700);

    const analytics = computeAnalytics(streakSessions, NOW);
    expect(analytics.lifetimeMinutes).toBe(420);
    expect(analytics.series.daily).toHaveLength(7);
    expect(analytics.series.weekly).toHaveLength(8);
    expect(analytics.series.monthly).toHaveLength(14);
    expect(analytics.series.yearly).toHaveLength(12);
  });

  it("formats Firebase popup auth errors cleanly without raw stack strings", () => {
    expect(formatFirebaseAuthError({ code: "auth/popup-closed-by-user" })).toContain(
      "Sign-in was cancelled before completion",
    );
    expect(formatFirebaseAuthError({ code: "auth/popup-blocked" })).toContain("popup was blocked");
    expect(formatFirebaseAuthError({ code: "auth/cancelled-popup-request" })).toBeNull();
    expect(formatFirebaseAuthError(new Error("Firebase: Custom issue"))).toBe("Custom issue");
  });
});
