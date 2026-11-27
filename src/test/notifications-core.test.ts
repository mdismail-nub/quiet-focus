import { describe, expect, it } from "vitest";
import {
  MOTIVATION_MESSAGES,
  buildBreakCompletePayload,
  buildBreakStartPayload,
  buildFocusPausedPayload,
  buildFocusStartPayload,
  buildMotivationPayload,
  buildSessionCompletePayload,
  defaultNotificationPreferences,
  getEffectiveReminderSlots,
  getLocalPartsInTimezone,
  isWithinQuietHours,
  pickMotivationalMessage,
  sanitizeNotificationPreferences,
} from "@/lib/notifications-core";

describe("notifications-core", () => {
  it("provides at least 40 unique friendly motivational messages", () => {
    expect(MOTIVATION_MESSAGES.length).toBeGreaterThanOrEqual(40);
    const ids = new Set(MOTIVATION_MESSAGES.map((m) => m.id));
    expect(ids.size).toBe(MOTIVATION_MESSAGES.length);
  });

  it("avoids repeating recent motivational message IDs", () => {
    const recent = MOTIVATION_MESSAGES.slice(0, 15).map((m) => m.id);
    const { message, nextRecentIds } = pickMotivationalMessage(recent, "any", () => 0.2);

    expect(recent).not.toContain(message.id);
    expect(nextRecentIds.at(-1)).toBe(message.id);
  });

  it("evaluates overnight and daytime quiet hours accurately", () => {
    expect(isWithinQuietHours("23:15", "22:00", "07:00")).toBe(true);
    expect(isWithinQuietHours("06:30", "22:00", "07:00")).toBe(true);
    expect(isWithinQuietHours("07:00", "22:00", "07:00")).toBe(false);
    expect(isWithinQuietHours("14:00", "22:00", "07:00")).toBe(false);
    expect(isWithinQuietHours("13:30", "13:00", "15:00")).toBe(true);
    expect(isWithinQuietHours("15:30", "13:00", "15:00")).toBe(false);
  });

  it("handles DST spring-forward and fall-back transitions accurately in user timezone", () => {
    // 2026-03-08 US DST spring-forward at 02:00 EST (07:00 UTC) -> jumps to 03:00 EDT
    const justBeforeSpring = Date.UTC(2026, 2, 8, 6, 59);
    const justAfterSpring = Date.UTC(2026, 2, 8, 7, 1);

    expect(getLocalPartsInTimezone(justBeforeSpring, "America/New_York").hhmm).toBe("01:59");
    expect(getLocalPartsInTimezone(justAfterSpring, "America/New_York").hhmm).toBe("03:01");

    // 2026-11-01 US DST fall-back at 02:00 EDT (06:00 UTC) -> returns to 01:00 EST
    const duringFirstOneAm = Date.UTC(2026, 10, 1, 5, 30);
    const duringSecondOneAm = Date.UTC(2026, 10, 1, 6, 30);

    expect(getLocalPartsInTimezone(duringFirstOneAm, "America/New_York").hhmm).toBe("01:30");
    expect(getLocalPartsInTimezone(duringSecondOneAm, "America/New_York").hhmm).toBe("01:30");
  });

  it("resolves effective reminder slots for daily counts and custom times", () => {
    const base = defaultNotificationPreferences("UTC");
    expect(getEffectiveReminderSlots({ ...base, dailyCount: 1 }).map((s) => s.time)).toEqual([
      "09:00",
    ]);
    expect(getEffectiveReminderSlots({ ...base, dailyCount: 2 }).map((s) => s.time)).toEqual([
      "09:00",
      "20:00",
    ]);
    expect(getEffectiveReminderSlots({ ...base, dailyCount: 3 }).map((s) => s.time)).toEqual([
      "09:00",
      "14:00",
      "20:00",
    ]);

    const withCustom = sanitizeNotificationPreferences({
      ...base,
      dailyCount: 2,
      customTimes: ["16:45", "10:15", "19:30"],
    });
    expect(getEffectiveReminderSlots(withCustom).map((s) => s.time)).toEqual(["10:15", "16:45"]);
  });

  it("builds cohesive branded payloads for focus, pause, completion, break, and motivation", () => {
    const start = buildFocusStartPayload({
      sessionId: "sess_1",
      scheduleVersion: 1,
      minutes: 25,
      remainingMinutes: 25,
      endAt: Date.UTC(2026, 4, 1, 10, 25),
      label: "Write tests",
      timezone: "UTC",
    });
    expect(start.tag).toBe("focus-active-session");
    expect(start.title).toContain("Write tests");
    expect(start.body).toContain("25m planned");
    expect(start.body).toContain("25m remaining");
    expect(start.image).toBe("/mascots/focus.jpg");
    expect(start.actions?.[0]?.action).toBe("open_timer");

    const paused = buildFocusPausedPayload({
      sessionId: "sess_1",
      scheduleVersion: 2,
      remainingMinutes: 14,
      label: "Write tests",
    });
    expect(paused.tag).toBe("focus-active-session");
    expect(paused.body).toContain("14m remaining");

    const complete = buildSessionCompletePayload({
      sessionId: "sess_1",
      minutes: 25,
      label: "Write tests",
    });
    expect(complete.title).toBe("Your focus session is complete!");
    expect(complete.body).toContain("25 minutes focusing");
    expect(complete.image).toBe("/mascots/complete.jpg");
    expect(complete.actions?.map((a) => a.action)).toEqual(["open_completion", "start_break"]);

    const brkStart = buildBreakStartPayload({
      sessionId: "brk_1",
      scheduleVersion: 3,
      minutes: 5,
      endAt: Date.UTC(2026, 4, 1, 10, 30),
      timezone: "UTC",
    });
    expect(brkStart.image).toBe("/mascots/break.jpg");

    const brkDone = buildBreakCompletePayload({
      sessionId: "brk_1",
      minutes: 5,
    });
    expect(brkDone.title).toBe("Break complete!");
    expect(brkDone.actions?.[0]?.action).toBe("start_focus");

    const mot = buildMotivationPayload({
      dayKey: "2026-05-01",
      slotId: "morning",
      message: MOTIVATION_MESSAGES[0]!,
    });
    expect(mot.image).toBe("/mascots/motivation.jpg");
    expect(mot.dedupeKey).toBe("motivation:2026-05-01:morning");
  });
});
