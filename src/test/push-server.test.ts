import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __getPushStoreSnapshotForTests,
  __resetPushStoreForTests,
  cancelSessionCompletion,
  getPublicVapidInfo,
  runSchedulerTick,
  scheduleSessionCompletion,
  sendTestPush,
  upsertPushSubscription,
  type PushSenderFn,
} from "@/lib/push-server";
import {
  defaultNotificationPreferences,
  type CompanionNotificationPayload,
} from "@/lib/notifications-core";

const VALID_SUB = {
  endpoint: "https://fcm.googleapis.com/fcm/send/example-token-12345",
  keys: {
    p256dh:
      "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM",
    auth: "tBHItJI5svbpez7KI4CCXg",
  },
};

const INST_ID = "inst_1234567890abcdef1234";
const SECRET = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2";

describe("push-server scheduling, auth, and cleanup", () => {
  beforeEach(() => {
    __resetPushStoreForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("never exposes a private VAPID key in public VAPID info", () => {
    const info = getPublicVapidInfo();
    expect(info.configured).toBe(true);
    expect(typeof info.publicKey).toBe("string");
    expect(info.publicKey.length).toBeGreaterThan(20);
    expect("privateKey" in info).toBe(false);
  });

  it("validates installation credentials and rejects spoofed secrets or SSRF endpoints", () => {
    const prefs = { ...defaultNotificationPreferences("UTC"), enabled: true };
    const created = upsertPushSubscription({
      installationId: INST_ID,
      installSecret: SECRET,
      subscription: VALID_SUB,
      preferences: prefs,
    });
    expect(created.ok).toBe(true);

    const wrongSecret = upsertPushSubscription({
      installationId: INST_ID,
      installSecret: "f".repeat(64),
      subscription: VALID_SUB,
      preferences: prefs,
    });
    expect(wrongSecret.ok).toBe(false);

    const ssrfSub = upsertPushSubscription({
      installationId: "inst_abcdef1234567890abcdef",
      installSecret: SECRET,
      subscription: {
        endpoint: "http://127.0.0.1:8080/internal",
        keys: VALID_SUB.keys,
      },
      preferences: prefs,
    });
    expect(ssrfSub.ok).toBe(false);
  });

  it("delivers scheduled session completion push idempotently and respects cancellation/pause", async () => {
    const prefs = {
      ...defaultNotificationPreferences("UTC"),
      enabled: true,
      sessionCompletion: true,
      dailyMotivation: false,
    };
    upsertPushSubscription({
      installationId: INST_ID,
      installSecret: SECRET,
      subscription: VALID_SUB,
      preferences: prefs,
    });

    const now = Date.now();
    const sent: CompanionNotificationPayload[] = [];
    const sender: PushSenderFn = vi.fn(async (_sub, payload) => {
      sent.push(payload);
      return { ok: true, statusCode: 201 };
    });

    // Start session at version 1, then pause (cancels v1)
    expect(
      scheduleSessionCompletion({
        installationId: INST_ID,
        installSecret: SECRET,
        sessionId: "sess_abc_1",
        scheduleVersion: 1,
        kind: "focus",
        expectedEndAt: now + 10_000,
        minutes: 25,
        label: "Spec",
      }).ok,
    ).toBe(true);

    expect(
      cancelSessionCompletion({
        installationId: INST_ID,
        installSecret: SECRET,
        sessionId: "sess_abc_1",
        scheduleVersion: 2,
        nextStatus: "paused",
      }).ok,
    ).toBe(true);

    // Tick after old end time should NOT send because paused
    await runSchedulerTick(now + 20_000, sender);
    expect(sent).toHaveLength(0);

    // Stale schedule version 1 rejected after version 2
    scheduleSessionCompletion({
      installationId: INST_ID,
      installSecret: SECRET,
      sessionId: "sess_abc_1",
      scheduleVersion: 1,
      kind: "focus",
      expectedEndAt: now + 5_000,
      minutes: 25,
    });
    await runSchedulerTick(now + 20_000, sender);
    expect(sent).toHaveLength(0);

    // Resume with version 3
    scheduleSessionCompletion({
      installationId: INST_ID,
      installSecret: SECRET,
      sessionId: "sess_abc_1",
      scheduleVersion: 3,
      kind: "focus",
      expectedEndAt: now + 30_000,
      minutes: 25,
      label: "Spec",
    });

    const r1 = await runSchedulerTick(now + 31_000, sender);
    expect(r1.sessionDelivered).toBe(1);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.title).toBe("Your focus session is complete!");

    // Second tick must NOT duplicate notification
    const r2 = await runSchedulerTick(now + 35_000, sender);
    expect(r2.sessionDelivered).toBe(0);
    expect(sent).toHaveLength(1);
  });

  it("respects timezone, DST, quiet hours, weekdays, active session suppression, and daily cap", async () => {
    const prefs = {
      ...defaultNotificationPreferences("America/New_York"),
      enabled: true,
      dailyMotivation: true,
      dailyCount: 2 as const,
      morningTime: "09:00",
      eveningTime: "20:00",
      quietHoursEnabled: true,
      quietStart: "22:00",
      quietEnd: "07:00",
      activeWeekdays: [1, 2, 3, 4, 5], // Mon-Fri only
    };
    upsertPushSubscription({
      installationId: INST_ID,
      installSecret: SECRET,
      subscription: VALID_SUB,
      preferences: prefs,
      activeSessionStatus: "idle",
    });

    const sent: CompanionNotificationPayload[] = [];
    const sender: PushSenderFn = vi.fn(async (_sub, payload) => {
      sent.push(payload);
      return { ok: true, statusCode: 201 };
    });

    // Monday 2026-03-09 (after US DST spring-forward, EDT = UTC-4): 09:05 EDT = 13:05 UTC
    const monMorningEDT = Date.UTC(2026, 2, 9, 13, 5);
    await runSchedulerTick(monMorningEDT, sender);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.category).toBe("motivation");

    // Re-running 2 minutes later does NOT duplicate morning reminder
    await runSchedulerTick(monMorningEDT + 120_000, sender);
    expect(sent).toHaveLength(1);

    // Suppress when user has an active running focus session at 20:05 EDT (00:05 UTC next day)
    const monEveningEDT = Date.UTC(2026, 2, 10, 0, 5);
    vi.useFakeTimers();
    vi.setSystemTime(monEveningEDT);
    const schedRes = scheduleSessionCompletion({
      installationId: INST_ID,
      installSecret: SECRET,
      sessionId: "sess_running_now",
      scheduleVersion: 1,
      kind: "focus",
      expectedEndAt: monEveningEDT + 25 * 60_000,
      minutes: 25,
    });
    expect(schedRes.ok).toBe(true);
    await runSchedulerTick(monEveningEDT, sender);
    expect(sent).toHaveLength(1); // Suppressed during active session

    // Cancel running session -> evening reminder now delivers (count 2 of 2)
    cancelSessionCompletion({
      installationId: INST_ID,
      installSecret: SECRET,
      sessionId: "sess_running_now",
      nextStatus: "idle",
    });
    await runSchedulerTick(monEveningEDT + 60_000, sender);
    expect(sent).toHaveLength(2);

    // Sunday 2026-03-15 09:05 EDT = 13:05 UTC -> skipped because Sunday (0) not in activeWeekdays
    const sunMorningEDT = Date.UTC(2026, 2, 15, 13, 5);
    await runSchedulerTick(sunMorningEDT, sender);
    expect(sent).toHaveLength(2);

    // Update morning time into quiet hours (06:30) on Tuesday -> suppressed by quiet hours
    upsertPushSubscription({
      installationId: INST_ID,
      installSecret: SECRET,
      subscription: VALID_SUB,
      preferences: { ...prefs, morningTime: "06:30" },
      activeSessionStatus: "idle",
    });
    const tueQuietEDT = Date.UTC(2026, 2, 10, 10, 35); // 06:35 EDT
    await runSchedulerTick(tueQuietEDT, sender);
    expect(sent).toHaveLength(2);
  });

  it("cleans up expired push subscriptions on 404 or 410 responses", async () => {
    upsertPushSubscription({
      installationId: INST_ID,
      installSecret: SECRET,
      subscription: VALID_SUB,
      preferences: { ...defaultNotificationPreferences("UTC"), enabled: true },
    });
    expect(__getPushStoreSnapshotForTests().subscriptionCount).toBe(1);

    const expiredSender: PushSenderFn = async () => ({ ok: false, statusCode: 410 });
    const res = await sendTestPush(INST_ID, SECRET, expiredSender);

    expect(res.ok).toBe(false);
    expect(res.expired).toBe(true);
    expect(__getPushStoreSnapshotForTests().subscriptionCount).toBe(0);
  });
});
