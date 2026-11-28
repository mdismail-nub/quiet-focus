import {
  cancelNativeSessionCompletion,
  closeNativeNotificationsByTag,
  getCachedNativePermissionState,
  isCapacitorNative,
  refreshNativeNotificationPermission,
  requestNativeNotificationPermission,
  scheduleNativeDailyMotivationReminders,
  scheduleNativeSessionCompletion,
  showNativeLocalNotification,
} from "./capacitor-native";
import {
  hasDeliveredNotification,
  loadNotificationRecord,
  markNotificationDelivered,
  saveNotificationRecord,
  type StoredNotificationRecord,
} from "./notification-db";
import {
  buildBreakCompletePayload,
  buildSessionCompletePayload,
  type CompanionNotificationPayload,
  type NotificationPermissionState,
  type NotificationPreferences,
} from "./notifications-core";

export interface NotificationSupportInfo {
  notificationApi: boolean;
  serviceWorker: boolean;
  pushManager: boolean;
  actionsSupported: boolean;
  isIOS: boolean;
  isStandalone: boolean;
  iosNeedsHomeScreen: boolean;
  isNativeApp?: boolean;
}

export function getNotificationSupport(): NotificationSupportInfo {
  if (typeof window === "undefined") {
    return {
      notificationApi: false,
      serviceWorker: false,
      pushManager: false,
      actionsSupported: false,
      isIOS: false,
      isStandalone: false,
      iosNeedsHomeScreen: false,
      isNativeApp: false,
    };
  }

  if (isCapacitorNative()) {
    return {
      notificationApi: true,
      serviceWorker: false,
      pushManager: false,
      actionsSupported: true,
      isIOS: false,
      isStandalone: true,
      iosNeedsHomeScreen: false,
      isNativeApp: true,
    };
  }

  const notificationApi = "Notification" in window;
  const serviceWorker = "serviceWorker" in navigator;
  const pushManager = "PushManager" in window;
  const actionsSupported =
    notificationApi &&
    typeof Notification !== "undefined" &&
    Boolean(Notification.prototype) &&
    "actions" in Notification.prototype;

  const ua = window.navigator.userAgent.toLowerCase();
  const isIOS =
    /iphone|ipad|ipod/.test(ua) || (ua.includes("macintosh") && "ontouchend" in document);
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true;

  return {
    notificationApi,
    serviceWorker,
    pushManager,
    actionsSupported,
    isIOS,
    isStandalone,
    iosNeedsHomeScreen: isIOS && !isStandalone,
    isNativeApp: false,
  };
}

export function getPermissionState(): NotificationPermissionState {
  if (isCapacitorNative()) {
    return getCachedNativePermissionState();
  }
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }
  const p = Notification.permission;
  if (p === "granted" || p === "denied" || p === "default") return p;
  return "unsupported";
}

export async function refreshPermissionState(): Promise<NotificationPermissionState> {
  if (isCapacitorNative()) {
    return refreshNativeNotificationPermission();
  }
  return getPermissionState();
}

export async function requestNotificationPermissionExplicit(): Promise<NotificationPermissionState> {
  if (isCapacitorNative()) {
    return requestNativeNotificationPermission();
  }
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  try {
    const result = await new Promise<NotificationPermission>((resolve, reject) => {
      const maybePromise = Notification.requestPermission((legacyPerm) => {
        resolve(legacyPerm);
      });
      if (maybePromise && typeof maybePromise.then === "function") {
        maybePromise.then(resolve, reject);
      }
    });
    return result === "granted" || result === "denied" ? result : "default";
  } catch {
    return getPermissionState();
  }
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMs = 8000,
): Promise<Response> {
  if (typeof AbortController === "undefined") {
    return fetch(input, init);
  }
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

export function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function getReadyServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (isCapacitorNative()) return null;
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    const existing = await navigator.serviceWorker.getRegistration();
    if (existing) return existing;
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500)),
    ]);
  } catch {
    return null;
  }
}

export async function showAppNotification(payload: CompanionNotificationPayload): Promise<boolean> {
  if (isCapacitorNative()) {
    const perm = await refreshNativeNotificationPermission();
    if (perm !== "granted") return false;
    if (payload.dedupeKey) {
      const already = await hasDeliveredNotification(payload.dedupeKey);
      if (already) return false;
      await markNotificationDelivered(payload.dedupeKey, payload.category);
    }
    return showNativeLocalNotification(payload);
  }

  if (getPermissionState() !== "granted") return false;

  if (payload.dedupeKey) {
    const already = await hasDeliveredNotification(payload.dedupeKey);
    if (already) return false;
    await markNotificationDelivered(payload.dedupeKey, payload.category);
  }

  const support = getNotificationSupport();
  const reg = await getReadyServiceWorkerRegistration();

  if (reg && typeof reg.showNotification === "function") {
    try {
      const options: NotificationOptions & {
        image?: string;
        renotify?: boolean;
        actions?: { action: string; title: string }[];
      } = {
        body: payload.body,
        icon: payload.icon,
        badge: payload.badge,
        image: payload.image,
        tag: payload.tag,
        requireInteraction: Boolean(payload.requireInteraction),
        renotify: Boolean(payload.renotify),
        silent: Boolean(payload.silent),
        data: {
          url: payload.url,
          category: payload.category,
          sessionId: payload.sessionId,
          kind: payload.kind,
          minutes: payload.minutes,
        },
        ...(support.actionsSupported && payload.actions
          ? { actions: payload.actions.slice(0, 2) }
          : {}),
      };
      await reg.showNotification(payload.title, options);
      return true;
    } catch {
      // Fall back to window Notification below
    }
  }

  try {
    if (typeof Notification !== "undefined") {
      new Notification(payload.title, {
        body: payload.body,
        icon: payload.icon,
        tag: payload.tag,
        silent: Boolean(payload.silent),
      });
      return true;
    }
  } catch {
    // Ignore unsupported Notification constructor (e.g. Android Chrome window context)
  }
  return false;
}

export async function closeAppNotificationsByTag(tag: string): Promise<void> {
  if (isCapacitorNative()) {
    await closeNativeNotificationsByTag(tag);
    return;
  }
  const reg = await getReadyServiceWorkerRegistration();
  if (!reg || typeof reg.getNotifications !== "function") return;
  try {
    const active = await reg.getNotifications({ tag });
    for (const n of active) {
      n.close();
    }
  } catch {
    // Ignore errors
  }
}

function authHeaders(record: StoredNotificationRecord, idToken?: string | null): HeadersInit {
  return {
    "content-type": "application/json",
    "x-installation-id": record.installationId,
    "x-installation-secret": record.installSecret,
    ...(idToken ? { authorization: `Bearer ${idToken}` } : {}),
  };
}

export async function syncPushSubscriptionAndPrefs(params: {
  preferences: NotificationPreferences;
  activeSessionStatus: "idle" | "running" | "paused";
  idToken?: string | null;
  forceSubscribe?: boolean;
}): Promise<{
  subscribed: boolean;
  offline: boolean;
  expiredCleaned?: boolean;
  error?: string;
}> {
  const record = await loadNotificationRecord();
  const nextRecord: StoredNotificationRecord = {
    ...record,
    preferences: params.preferences,
    pendingSync: true,
  };
  await saveNotificationRecord(nextRecord);

  if (isCapacitorNative()) {
    const perm = await refreshNativeNotificationPermission();
    await scheduleNativeDailyMotivationReminders(
      perm === "granted" ? params.preferences : { ...params.preferences, enabled: false },
    );
    await saveNotificationRecord({
      ...nextRecord,
      pushEndpoint: null,
      pendingSync: false,
      lastSyncedAt: Date.now(),
    });
    return { subscribed: perm === "granted" && params.preferences.enabled, offline: false };
  }

  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { subscribed: Boolean(record.pushEndpoint), offline: true };
  }

  const support = getNotificationSupport();
  const permission = getPermissionState();

  try {
    // If notifications are disabled or permission is not granted, keep local state & sync disable/unsubscribe
    if (!params.preferences.enabled || permission !== "granted") {
      if (record.pushEndpoint) {
        const reg = await getReadyServiceWorkerRegistration();
        const existingSub = await reg?.pushManager?.getSubscription();
        if (existingSub) {
          await existingSub.unsubscribe().catch(() => {});
        }
        await fetchWithTimeout("/api/push/unsubscribe", {
          method: "POST",
          headers: authHeaders(nextRecord, params.idToken),
          body: JSON.stringify({ installationId: nextRecord.installationId }),
        }).catch(() => {});
      }
      await saveNotificationRecord({
        ...nextRecord,
        pushEndpoint: null,
        pendingSync: false,
        lastSyncedAt: Date.now(),
      });
      return { subscribed: false, offline: false };
    }

    if (!support.serviceWorker || !support.pushManager) {
      // Browser supports local Notifications API without PushManager
      await saveNotificationRecord({
        ...nextRecord,
        pendingSync: false,
        lastSyncedAt: Date.now(),
      });
      return { subscribed: false, offline: false };
    }

    const vapidRes = await fetchWithTimeout("/api/push/vapid-public-key", { cache: "no-store" });
    if (!vapidRes.ok) {
      return {
        subscribed: Boolean(record.pushEndpoint),
        offline: true,
        error: "Could not reach push service.",
      };
    }
    const { publicKey } = (await vapidRes.json()) as { publicKey: string };

    const reg = await getReadyServiceWorkerRegistration();
    if (!reg || !reg.pushManager) {
      return { subscribed: false, offline: false };
    }

    let pushSub = await reg.pushManager.getSubscription();
    if (pushSub && record.vapidPublicKey && record.vapidPublicKey !== publicKey) {
      await pushSub.unsubscribe().catch(() => {});
      pushSub = null;
    }

    if (!pushSub && (params.forceSubscribe || params.preferences.enabled)) {
      pushSub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }

    if (!pushSub) {
      return { subscribed: false, offline: false };
    }

    const subRes = await fetchWithTimeout("/api/push/subscribe", {
      method: "POST",
      headers: authHeaders(nextRecord, params.idToken),
      body: JSON.stringify({
        installationId: nextRecord.installationId,
        subscription: pushSub.toJSON(),
        preferences: params.preferences,
        activeSessionStatus: params.activeSessionStatus,
      }),
    });

    if (!subRes.ok) {
      return {
        subscribed: false,
        offline: false,
        error: "Unable to save push subscription on server.",
      };
    }

    await saveNotificationRecord({
      ...nextRecord,
      pushEndpoint: pushSub.endpoint,
      vapidPublicKey: publicKey,
      pendingSync: false,
      lastSyncedAt: Date.now(),
    });

    return { subscribed: true, offline: false };
  } catch (err) {
    return {
      subscribed: Boolean(record.pushEndpoint),
      offline: typeof navigator !== "undefined" ? navigator.onLine === false : false,
      error: err instanceof Error ? err.message : "Failed to sync notification settings.",
    };
  }
}

export async function syncSessionScheduleToServer(params: {
  sessionId: string;
  scheduleVersion: number;
  kind: "focus" | "break";
  expectedEndAt: number;
  minutes: number;
  label?: string;
  idToken?: string | null;
}): Promise<{ scheduled: boolean; offline: boolean }> {
  if (isCapacitorNative()) {
    const record = await loadNotificationRecord();
    if (!record.preferences.enabled) {
      return { scheduled: false, offline: false };
    }
    const payload =
      params.kind === "break"
        ? buildBreakCompletePayload({
            sessionId: params.sessionId,
            minutes: params.minutes,
            sound: record.preferences.sound,
          })
        : buildSessionCompletePayload({
            sessionId: params.sessionId,
            minutes: params.minutes,
            ...(params.label ? { label: params.label } : {}),
            sound: record.preferences.sound,
          });
    const scheduled = await scheduleNativeSessionCompletion({
      expectedEndAt: params.expectedEndAt,
      payload,
    });
    return { scheduled, offline: false };
  }

  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { scheduled: false, offline: true };
  }
  const record = await loadNotificationRecord();
  if (!record.preferences.enabled || !record.pushEndpoint) {
    return { scheduled: false, offline: false };
  }
  try {
    const res = await fetchWithTimeout("/api/push/schedule-session", {
      method: "POST",
      headers: authHeaders(record, params.idToken),
      body: JSON.stringify({
        installationId: record.installationId,
        sessionId: params.sessionId,
        scheduleVersion: params.scheduleVersion,
        kind: params.kind,
        expectedEndAt: params.expectedEndAt,
        minutes: params.minutes,
        label: params.label ?? "",
      }),
    });
    return { scheduled: res.ok, offline: false };
  } catch {
    return { scheduled: false, offline: true };
  }
}

export async function cancelSessionScheduleOnServer(params: {
  sessionId?: string;
  scheduleVersion?: number;
  nextStatus?: "idle" | "paused";
  idToken?: string | null;
}): Promise<void> {
  if (isCapacitorNative()) {
    await cancelNativeSessionCompletion();
    return;
  }
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  const record = await loadNotificationRecord();
  if (!record.pushEndpoint) return;
  try {
    await fetchWithTimeout("/api/push/cancel-session", {
      method: "POST",
      headers: authHeaders(record, params.idToken),
      body: JSON.stringify({
        installationId: record.installationId,
        sessionId: params.sessionId,
        scheduleVersion: params.scheduleVersion,
        nextStatus: params.nextStatus ?? "idle",
      }),
    });
  } catch {
    // Best-effort cancellation
  }
}

export async function sendServerOrLocalTestNotification(
  idToken?: string | null,
): Promise<{ ok: boolean; via: "push" | "local" | "none"; message: string }> {
  const perm = isCapacitorNative()
    ? await refreshNativeNotificationPermission()
    : getPermissionState();
  if (perm !== "granted") {
    return {
      ok: false,
      via: "none",
      message: "Enable notification permission first to preview a system notification.",
    };
  }

  const record = await loadNotificationRecord();
  if (
    !isCapacitorNative() &&
    typeof navigator !== "undefined" &&
    navigator.onLine !== false &&
    record.pushEndpoint
  ) {
    try {
      const res = await fetchWithTimeout("/api/push/test", {
        method: "POST",
        headers: authHeaders(record, idToken),
        body: JSON.stringify({ installationId: record.installationId }),
      });
      if (res.ok) {
        return {
          ok: true,
          via: "push",
          message: "Test push notification sent through the background push service.",
        };
      }
    } catch {
      // Fall back to local SW notification
    }
  }

  const shown = await showAppNotification({
    category: "motivation",
    title: "Focus Companion",
    body: "Hey! Your Focus Companion notifications are ready whenever you are.",
    tag: `focus-test-${Date.now()}`,
    url: "/notifications",
    icon: "/pwa-192x192.png",
    badge: "/pwa-192x192.png",
    image: "/mascots/motivation.jpg",
    silent: !record.preferences.sound,
    actions: [
      { action: "start_focus", title: "Start Focus" },
      { action: "dismiss", title: "Dismiss" },
    ],
  });

  return shown
    ? {
        ok: true,
        via: "local",
        message: "Test notification displayed locally on this device.",
      }
    : {
        ok: false,
        via: "none",
        message: "Could not display notification in this browser context.",
      };
}
