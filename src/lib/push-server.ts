import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  generateVAPIDKeys,
  sendNotification,
  setVapidDetails,
  type PushSubscription,
} from "web-push";
import {
  buildBreakCompletePayload,
  buildMotivationPayload,
  buildSessionCompletePayload,
  getEffectiveReminderSlots,
  getLocalPartsInTimezone,
  hhmmToMinutes,
  isWithinQuietHours,
  pickMotivationalMessage,
  sanitizeNotificationPreferences,
  type CompanionNotificationPayload,
  type NotificationPreferences,
} from "./notifications-core";

export interface ServerSubscriptionRecord {
  installationId: string;
  secretHash: string;
  userId: string | null;
  subscription: PushSubscription;
  preferences: NotificationPreferences;
  activeSessionStatus: "idle" | "running" | "paused";
  recentMessageIds: string[];
  createdAt: number;
  updatedAt: number;
}

export interface ServerSessionSchedule {
  installationId: string;
  sessionId: string;
  scheduleVersion: number;
  kind: "focus" | "break";
  expectedEndAt: number;
  minutes: number;
  label: string;
  status: "scheduled" | "cancelled" | "sent";
  updatedAt: number;
}

interface PersistedState {
  vapidKeys?: { publicKey: string; privateKey: string };
  subscriptions: ServerSubscriptionRecord[];
  sessionSchedules: ServerSessionSchedule[];
  sentReminders: string[];
  dailySentCounts: [string, number][];
}

const STORE_FILE = path.join("/tmp", "quiet-focus-push-store.json");

let vapidKeys: { publicKey: string; privateKey: string } | null = null;
let vapidConfiguredFromEnv = false;

const subscriptions = new Map<string, ServerSubscriptionRecord>();
const sessionSchedules = new Map<string, ServerSessionSchedule>();
const sentReminders = new Set<string>();
const dailySentCounts = new Map<string, number>();

let storeInitialized = false;
let schedulerTimer: ReturnType<typeof setInterval> | null = null;

function hashSecret(secret: string): string {
  return crypto.createHash("sha256").update(secret).digest("hex");
}

function constantTimeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}

function loadStoreOnce(): void {
  if (storeInitialized) return;
  storeInitialized = true;

  const envPub = process.env["VAPID_PUBLIC_KEY"]?.trim();
  const envPriv = process.env["VAPID_PRIVATE_KEY"]?.trim();
  if (envPub && envPriv) {
    vapidKeys = { publicKey: envPub, privateKey: envPriv };
    vapidConfiguredFromEnv = true;
  }

  try {
    if (fs.existsSync(STORE_FILE)) {
      const raw = fs.readFileSync(STORE_FILE, "utf8");
      const parsed = JSON.parse(raw) as Partial<PersistedState>;
      if (!vapidKeys && parsed.vapidKeys?.publicKey && parsed.vapidKeys?.privateKey) {
        vapidKeys = parsed.vapidKeys;
      }
      if (Array.isArray(parsed.subscriptions)) {
        for (const sub of parsed.subscriptions) {
          if (sub?.installationId && sub?.subscription?.endpoint) {
            subscriptions.set(sub.installationId, {
              ...sub,
              preferences: sanitizeNotificationPreferences(sub.preferences),
            });
          }
        }
      }
      if (Array.isArray(parsed.sessionSchedules)) {
        for (const sch of parsed.sessionSchedules) {
          if (sch?.installationId && sch?.sessionId) {
            sessionSchedules.set(sch.installationId, sch);
          }
        }
      }
      if (Array.isArray(parsed.sentReminders)) {
        for (const key of parsed.sentReminders.slice(-2000)) {
          sentReminders.add(key);
        }
      }
      if (Array.isArray(parsed.dailySentCounts)) {
        for (const [k, v] of parsed.dailySentCounts.slice(-2000)) {
          dailySentCounts.set(k, v);
        }
      }
    }
  } catch {
    // Ignore corrupt temp snapshot and start fresh
  }

  if (!vapidKeys) {
    vapidKeys = generateVAPIDKeys();
    persistStore();
  }

  const subject = process.env["VAPID_SUBJECT"]?.trim() || "mailto:focus@quietfocus.app";
  setVapidDetails(subject, vapidKeys.publicKey, vapidKeys.privateKey);
}

function persistStore(): void {
  try {
    const payload: PersistedState = {
      ...(vapidConfiguredFromEnv ? {} : vapidKeys ? { vapidKeys } : {}),
      subscriptions: Array.from(subscriptions.values()),
      sessionSchedules: Array.from(sessionSchedules.values()),
      sentReminders: Array.from(sentReminders).slice(-2000),
      dailySentCounts: Array.from(dailySentCounts.entries()).slice(-2000),
    };
    fs.writeFileSync(STORE_FILE, JSON.stringify(payload), { mode: 0o600 });
  } catch {
    // Ephemeral / read-only FS fallback: continue in memory
  }
}

export function getPublicVapidInfo(): { publicKey: string; configured: boolean } {
  loadStoreOnce();
  return {
    publicKey: vapidKeys!.publicKey,
    configured: true,
  };
}

export function isValidInstallationId(id: string): boolean {
  return typeof id === "string" && /^inst_[a-f0-9]{16,48}$/.test(id);
}

export function isValidInstallSecret(secret: string): boolean {
  return typeof secret === "string" && /^[a-f0-9]{32,128}$/.test(secret);
}

export function isValidPushSubscription(sub: unknown): sub is PushSubscription {
  if (!sub || typeof sub !== "object") return false;
  const candidate = sub as Partial<PushSubscription>;
  if (typeof candidate.endpoint !== "string" || candidate.endpoint.length > 2048) return false;
  try {
    const parsed = new URL(candidate.endpoint);
    if (parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host.startsWith("10.") ||
      host.startsWith("192.168.") ||
      host === "169.254.169.254"
    ) {
      return false;
    }
  } catch {
    return false;
  }
  const keys = candidate.keys;
  if (!keys || typeof keys !== "object") return false;
  if (typeof keys.p256dh !== "string" || keys.p256dh.length < 16 || keys.p256dh.length > 512) {
    return false;
  }
  if (typeof keys.auth !== "string" || keys.auth.length < 8 || keys.auth.length > 256) {
    return false;
  }
  return true;
}

export function verifyOrClaimInstallation(
  installationId: string,
  installSecret: string,
): { ok: boolean; existing: ServerSubscriptionRecord | null } {
  loadStoreOnce();
  if (!isValidInstallationId(installationId) || !isValidInstallSecret(installSecret)) {
    return { ok: false, existing: null };
  }
  const existing = subscriptions.get(installationId) ?? null;
  if (!existing) {
    return { ok: true, existing: null };
  }
  const ok = constantTimeEqualHex(existing.secretHash, hashSecret(installSecret));
  return { ok, existing };
}

export function upsertPushSubscription(params: {
  installationId: string;
  installSecret: string;
  userId?: string | null;
  subscription: PushSubscription;
  preferences: Partial<NotificationPreferences>;
  activeSessionStatus?: "idle" | "running" | "paused";
}): { ok: boolean; error?: string; record?: ServerSubscriptionRecord } {
  const authCheck = verifyOrClaimInstallation(params.installationId, params.installSecret);
  if (!authCheck.ok) {
    return { ok: false, error: "Invalid installation credentials." };
  }
  if (!isValidPushSubscription(params.subscription)) {
    return { ok: false, error: "Invalid Web Push subscription payload." };
  }

  const now = Date.now();
  const prev = authCheck.existing;
  const sanitizedPrefs = sanitizeNotificationPreferences(params.preferences);
  const rec: ServerSubscriptionRecord = {
    installationId: params.installationId,
    secretHash: prev?.secretHash ?? hashSecret(params.installSecret),
    userId: params.userId !== undefined ? params.userId : (prev?.userId ?? null),
    subscription: {
      endpoint: params.subscription.endpoint,
      ...(params.subscription.expirationTime !== undefined
        ? { expirationTime: params.subscription.expirationTime }
        : {}),
      keys: {
        p256dh: params.subscription.keys.p256dh,
        auth: params.subscription.keys.auth,
      },
    },
    preferences: sanitizedPrefs,
    activeSessionStatus: params.activeSessionStatus ?? prev?.activeSessionStatus ?? "idle",
    recentMessageIds:
      sanitizedPrefs.recentMessageIds.length > 0
        ? sanitizedPrefs.recentMessageIds
        : (prev?.recentMessageIds ?? []),
    createdAt: prev?.createdAt ?? now,
    updatedAt: now,
  };
  subscriptions.set(params.installationId, rec);
  persistStore();
  return { ok: true, record: rec };
}

export function updateSubscriptionPreferences(params: {
  installationId: string;
  installSecret: string;
  preferences?: Partial<NotificationPreferences>;
  activeSessionStatus?: "idle" | "running" | "paused";
  userId?: string | null;
}): { ok: boolean; error?: string } {
  const authCheck = verifyOrClaimInstallation(params.installationId, params.installSecret);
  if (!authCheck.ok) {
    return { ok: false, error: "Invalid installation credentials." };
  }
  if (!authCheck.existing) {
    return { ok: true };
  }
  const prev = authCheck.existing;
  const nextPrefs = params.preferences
    ? sanitizeNotificationPreferences({ ...prev.preferences, ...params.preferences })
    : prev.preferences;
  subscriptions.set(params.installationId, {
    ...prev,
    preferences: nextPrefs,
    activeSessionStatus: params.activeSessionStatus ?? prev.activeSessionStatus,
    userId: params.userId !== undefined ? params.userId : prev.userId,
    updatedAt: Date.now(),
  });
  persistStore();
  return { ok: true };
}

export function removePushSubscription(
  installationId: string,
  installSecret: string,
): { ok: boolean; error?: string } {
  const authCheck = verifyOrClaimInstallation(installationId, installSecret);
  if (!authCheck.ok) {
    return { ok: false, error: "Invalid installation credentials." };
  }
  subscriptions.delete(installationId);
  sessionSchedules.delete(installationId);
  persistStore();
  return { ok: true };
}

export function scheduleSessionCompletion(params: {
  installationId: string;
  installSecret: string;
  sessionId: string;
  scheduleVersion: number;
  kind: "focus" | "break";
  expectedEndAt: number;
  minutes: number;
  label?: string;
}): { ok: boolean; error?: string } {
  const authCheck = verifyOrClaimInstallation(params.installationId, params.installSecret);
  if (!authCheck.ok) {
    return { ok: false, error: "Invalid installation credentials." };
  }
  if (!params.sessionId || !/^[a-zA-Z0-9_-]{4,128}$/.test(params.sessionId)) {
    return { ok: false, error: "Invalid sessionId." };
  }
  if (!Number.isInteger(params.scheduleVersion) || params.scheduleVersion < 1) {
    return { ok: false, error: "Invalid scheduleVersion." };
  }
  if (!Number.isInteger(params.minutes) || params.minutes < 1 || params.minutes > 240) {
    return { ok: false, error: "Invalid duration minutes." };
  }
  const now = Date.now();
  if (
    !Number.isFinite(params.expectedEndAt) ||
    params.expectedEndAt < now - 60_000 ||
    params.expectedEndAt > now + 24 * 60 * 60 * 1000
  ) {
    return { ok: false, error: "Expected completion time out of bounds." };
  }

  const prev = sessionSchedules.get(params.installationId);
  if (
    prev &&
    prev.sessionId === params.sessionId &&
    prev.scheduleVersion > params.scheduleVersion
  ) {
    return { ok: true }; // Ignore stale schedule request
  }

  sessionSchedules.set(params.installationId, {
    installationId: params.installationId,
    sessionId: params.sessionId,
    scheduleVersion: params.scheduleVersion,
    kind: params.kind === "break" ? "break" : "focus",
    expectedEndAt: Math.round(params.expectedEndAt),
    minutes: params.minutes,
    label: (params.label ?? "").trim().slice(0, 60),
    status: "scheduled",
    updatedAt: now,
  });

  if (authCheck.existing) {
    subscriptions.set(params.installationId, {
      ...authCheck.existing,
      activeSessionStatus: "running",
      updatedAt: now,
    });
  }

  persistStore();
  return { ok: true };
}

export function cancelSessionCompletion(params: {
  installationId: string;
  installSecret: string;
  sessionId?: string;
  scheduleVersion?: number;
  nextStatus?: "idle" | "paused";
}): { ok: boolean; error?: string } {
  const authCheck = verifyOrClaimInstallation(params.installationId, params.installSecret);
  if (!authCheck.ok) {
    return { ok: false, error: "Invalid installation credentials." };
  }
  const prev = sessionSchedules.get(params.installationId);
  if (prev) {
    const versionMatches =
      params.scheduleVersion === undefined || params.scheduleVersion >= prev.scheduleVersion;
    const sessionMatches = !params.sessionId || params.sessionId === prev.sessionId;
    if (versionMatches && sessionMatches && prev.status === "scheduled") {
      sessionSchedules.set(params.installationId, {
        ...prev,
        scheduleVersion: Math.max(
          prev.scheduleVersion,
          params.scheduleVersion ?? prev.scheduleVersion,
        ),
        status: "cancelled",
        updatedAt: Date.now(),
      });
    }
  }
  if (authCheck.existing) {
    subscriptions.set(params.installationId, {
      ...authCheck.existing,
      activeSessionStatus: params.nextStatus ?? "idle",
      updatedAt: Date.now(),
    });
  }
  persistStore();
  return { ok: true };
}

export type PushSenderFn = (
  subscription: PushSubscription,
  payload: CompanionNotificationPayload,
) => Promise<{ ok: boolean; statusCode?: number }>;

async function defaultSendPush(
  subscription: PushSubscription,
  payload: CompanionNotificationPayload,
): Promise<{ ok: boolean; statusCode?: number }> {
  loadStoreOnce();
  try {
    const res = await sendNotification(subscription, JSON.stringify(payload), {
      TTL: 60 * 60,
      urgency:
        payload.category === "completion" || payload.category === "break" ? "high" : "normal",
    });
    return { ok: true, statusCode: res.statusCode };
  } catch (err) {
    const statusCode =
      typeof err === "object" && err !== null && "statusCode" in err
        ? Number((err as { statusCode?: unknown }).statusCode)
        : 500;
    return { ok: false, statusCode };
  }
}

export async function sendTestPush(
  installationId: string,
  installSecret: string,
  sender: PushSenderFn = defaultSendPush,
): Promise<{ ok: boolean; expired?: boolean; error?: string }> {
  const authCheck = verifyOrClaimInstallation(installationId, installSecret);
  if (!authCheck.ok) return { ok: false, error: "Invalid installation credentials." };
  if (!authCheck.existing) {
    return { ok: false, error: "No active push subscription registered on this device." };
  }

  const payload = buildMotivationPayload({
    dayKey: new Date().toISOString().slice(0, 10),
    slotId: `test_${Date.now()}`,
    message: {
      id: "test",
      text: "Hey! Your Focus Companion notifications are ready whenever you are.",
    },
    sound: authCheck.existing.preferences.sound,
  });

  const res = await sender(authCheck.existing.subscription, payload);
  if (!res.ok && (res.statusCode === 404 || res.statusCode === 410)) {
    subscriptions.delete(installationId);
    sessionSchedules.delete(installationId);
    persistStore();
    return { ok: false, expired: true, error: "Push subscription expired and was cleaned up." };
  }
  if (!res.ok) {
    return { ok: false, error: `Push delivery failed (status ${res.statusCode ?? 500}).` };
  }
  return { ok: true };
}

export async function runSchedulerTick(
  now: number = Date.now(),
  sender: PushSenderFn = defaultSendPush,
): Promise<{ sessionDelivered: number; motivationDelivered: number; cleanedUp: number }> {
  loadStoreOnce();
  let sessionDelivered = 0;
  let motivationDelivered = 0;
  let cleanedUp = 0;

  // 1. Due session & break completions
  for (const [installationId, sched] of sessionSchedules.entries()) {
    if (sched.status !== "scheduled" || sched.expectedEndAt > now) continue;
    const subRec = subscriptions.get(installationId);
    if (!subRec || !subRec.preferences.enabled) {
      sessionSchedules.set(installationId, { ...sched, status: "cancelled", updatedAt: now });
      continue;
    }

    if (sched.kind === "focus" && !subRec.preferences.sessionCompletion) {
      sessionSchedules.set(installationId, { ...sched, status: "cancelled", updatedAt: now });
      continue;
    }
    if (sched.kind === "break" && !subRec.preferences.breakReminders) {
      sessionSchedules.set(installationId, { ...sched, status: "cancelled", updatedAt: now });
      continue;
    }

    // Mark sent BEFORE network call for idempotency
    sessionSchedules.set(installationId, { ...sched, status: "sent", updatedAt: now });
    subscriptions.set(installationId, {
      ...subRec,
      activeSessionStatus: "idle",
      updatedAt: now,
    });

    const payload =
      sched.kind === "break"
        ? buildBreakCompletePayload({
            sessionId: sched.sessionId,
            minutes: sched.minutes,
            sound: subRec.preferences.sound,
          })
        : buildSessionCompletePayload({
            sessionId: sched.sessionId,
            minutes: sched.minutes,
            label: sched.label,
            sound: subRec.preferences.sound,
          });

    const res = await sender(subRec.subscription, payload);
    if (res.ok) {
      sessionDelivered++;
    } else if (res.statusCode === 404 || res.statusCode === 410) {
      subscriptions.delete(installationId);
      sessionSchedules.delete(installationId);
      cleanedUp++;
    }
  }

  // 2. Daily motivation reminders in each user's timezone
  for (const [installationId, subRec] of subscriptions.entries()) {
    const prefs = subRec.preferences;
    if (!prefs.enabled || !prefs.dailyMotivation) continue;
    if (subRec.activeSessionStatus === "running") continue;

    const local = getLocalPartsInTimezone(now, prefs.timezone);
    if (!prefs.activeWeekdays.includes(local.weekday)) continue;
    if (
      prefs.quietHoursEnabled &&
      isWithinQuietHours(local.hhmm, prefs.quietStart, prefs.quietEnd)
    ) {
      continue;
    }

    const dailyCountKey = `${installationId}:${local.dayKey}`;
    const alreadySentToday = dailySentCounts.get(dailyCountKey) ?? 0;
    if (alreadySentToday >= prefs.dailyCount) continue;

    const slots = getEffectiveReminderSlots(prefs);
    for (const slot of slots) {
      if ((dailySentCounts.get(dailyCountKey) ?? 0) >= prefs.dailyCount) break;

      const slotMin = hhmmToMinutes(slot.time);
      const diff = local.minutesSinceMidnight - slotMin;
      // Fire within a 15-minute window after scheduled minute
      if (diff < 0 || diff >= 15) continue;

      const idempotencyKey = `${installationId}:${local.dayKey}:${slot.slotId}`;
      if (sentReminders.has(idempotencyKey)) continue;

      // Mark idempotency key BEFORE sending so retries never duplicate
      sentReminders.add(idempotencyKey);
      dailySentCounts.set(dailyCountKey, (dailySentCounts.get(dailyCountKey) ?? 0) + 1);

      const { message, nextRecentIds } = pickMotivationalMessage(
        subRec.recentMessageIds,
        slot.windowHint,
      );
      subscriptions.set(installationId, {
        ...subRec,
        recentMessageIds: nextRecentIds,
        updatedAt: now,
      });

      const payload = buildMotivationPayload({
        dayKey: local.dayKey,
        slotId: slot.slotId,
        message,
        sound: prefs.sound,
      });

      const res = await sender(subRec.subscription, payload);
      if (res.ok) {
        motivationDelivered++;
      } else if (res.statusCode === 404 || res.statusCode === 410) {
        subscriptions.delete(installationId);
        sessionSchedules.delete(installationId);
        cleanedUp++;
        break;
      }
    }
  }

  persistStore();
  return { sessionDelivered, motivationDelivered, cleanedUp };
}

export function startPushScheduler(intervalMs = 15_000): void {
  loadStoreOnce();
  if (schedulerTimer) return;
  schedulerTimer = setInterval(() => {
    void runSchedulerTick();
  }, intervalMs);
  if (typeof schedulerTimer.unref === "function") {
    schedulerTimer.unref();
  }
}

export function __resetPushStoreForTests(): void {
  subscriptions.clear();
  sessionSchedules.clear();
  sentReminders.clear();
  dailySentCounts.clear();
  storeInitialized = true;
  if (!vapidKeys) {
    vapidKeys = generateVAPIDKeys();
  }
}

export function __getPushStoreSnapshotForTests() {
  return {
    subscriptionCount: subscriptions.size,
    scheduleCount: sessionSchedules.size,
    schedules: Array.from(sessionSchedules.values()),
    subscriptions: Array.from(subscriptions.values()),
  };
}
