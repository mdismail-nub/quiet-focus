import { Capacitor } from "@capacitor/core";
import { App, type BackButtonListenerEvent } from "@capacitor/app";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";
import {
  LocalNotifications,
  type ActionPerformed,
  type LocalNotificationSchema,
} from "@capacitor/local-notifications";
import { ScreenOrientation } from "@capacitor/screen-orientation";
import { SplashScreen } from "@capacitor/splash-screen";
import { StatusBar, Style } from "@capacitor/status-bar";
import {
  buildMotivationPayload,
  getEffectiveReminderSlots,
  isWithinQuietHours,
  pickMotivationalMessage,
  type CompanionNotificationPayload,
  type NotificationPermissionState,
  type NotificationPreferences,
} from "./notifications-core";

const FOCUS_ACTIVE_NOTIF_ID = 1001;
const FOCUS_SCHEDULED_END_ID = 1002;
const FOCUS_MOTIVATION_BASE_ID = 2000;
const FOCUS_MOTIVATION_MAX_SLOTS = 28;
const FOCUS_TEST_NOTIF_ID = 9001;

const CHANNEL_SESSIONS = "focusly_sessions";
const CHANNEL_BREAKS = "focusly_breaks";
const CHANNEL_MOTIVATION = "focusly_motivation";
const ACTION_TYPE_SESSION_ACTIVE = "focusly_session_active";
const ACTION_TYPE_SESSION_COMPLETE = "focusly_session_complete";
const ACTION_TYPE_MOTIVATION = "focusly_motivation";

let cachedNativePermission: NotificationPermissionState = "default";
let channelsInitialized = false;
let splashHidden = false;

export function isCapacitorNative(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export function isCapacitorAndroid(): boolean {
  if (!isCapacitorNative()) return false;
  try {
    return Capacitor.getPlatform() === "android";
  } catch {
    return false;
  }
}

export function getApiBaseUrl(): string {
  const configured =
    typeof import.meta !== "undefined" && import.meta.env
      ? (import.meta.env["VITE_API_BASE_URL"] as string | undefined)
      : undefined;
  return typeof configured === "string" ? configured.trim().replace(/\/+$/, "") : "";
}

export function resolveApiUrl(apiPath: string): string {
  const base = getApiBaseUrl();
  if (!base) return apiPath;
  const normalized = apiPath.startsWith("/") ? apiPath : `/${apiPath}`;
  return `${base}${normalized}`;
}

export function getCachedNativePermissionState(): NotificationPermissionState {
  return cachedNativePermission;
}

function mapNativePerm(perm: string | undefined): NotificationPermissionState {
  if (perm === "granted") return "granted";
  if (perm === "denied") return "denied";
  return "default";
}

export function hashTagToNotificationId(tag: string): number {
  if (tag === "focus-active-session") return FOCUS_ACTIVE_NOTIF_ID;
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = (hash * 31 + tag.charCodeAt(i)) | 0;
  }
  const positive = Math.abs(hash) % 900_000;
  return 10_000 + positive;
}

export async function ensureNativeNotificationSetup(): Promise<void> {
  if (!isCapacitorNative() || channelsInitialized) return;
  channelsInitialized = true;
  try {
    if (isCapacitorAndroid()) {
      await Promise.all([
        LocalNotifications.createChannel({
          id: CHANNEL_SESSIONS,
          name: "Focus Sessions",
          description: "Active focus sessions and completion alerts",
          importance: 4,
          visibility: 1,
          sound: "default",
          vibration: true,
        }),
        LocalNotifications.createChannel({
          id: CHANNEL_BREAKS,
          name: "Break Reminders",
          description: "Pomodoro break start and completion alerts",
          importance: 4,
          visibility: 1,
          sound: "default",
          vibration: true,
        }),
        LocalNotifications.createChannel({
          id: CHANNEL_MOTIVATION,
          name: "Daily Motivation",
          description: "Gentle daily encouragement reminders",
          importance: 3,
          visibility: 1,
          vibration: true,
        }),
      ]);
    }
    await Promise.all([
      LocalNotifications.registerActionTypes({
        types: [
          {
            id: ACTION_TYPE_SESSION_ACTIVE,
            actions: [{ id: "open_timer", title: "Open Timer" }],
          },
          {
            id: ACTION_TYPE_SESSION_COMPLETE,
            actions: [
              { id: "open_completion", title: "Open Summary" },
              { id: "start_break", title: "Take Break" },
            ],
          },
          {
            id: ACTION_TYPE_MOTIVATION,
            actions: [
              { id: "start_focus", title: "Start Focus" },
              { id: "dismiss", title: "Dismiss" },
            ],
          },
        ],
      }),
    ]);
  } catch {
    channelsInitialized = false;
  }
}

export async function refreshNativeNotificationPermission(): Promise<NotificationPermissionState> {
  if (!isCapacitorNative()) return "unsupported";
  try {
    const status = await LocalNotifications.checkPermissions();
    cachedNativePermission = mapNativePerm(status.display);
    return cachedNativePermission;
  } catch {
    return cachedNativePermission;
  }
}

export async function requestNativeNotificationPermission(): Promise<NotificationPermissionState> {
  if (!isCapacitorNative()) return "unsupported";
  try {
    const current = await refreshNativeNotificationPermission();
    if (current === "granted" || current === "denied") {
      return current;
    }
    const status = await LocalNotifications.requestPermissions();
    cachedNativePermission = mapNativePerm(status.display);
    return cachedNativePermission;
  } catch {
    return cachedNativePermission;
  }
}

function resolveChannelId(payload: CompanionNotificationPayload): string {
  if (payload.category === "break") return CHANNEL_BREAKS;
  if (payload.category === "motivation") return CHANNEL_MOTIVATION;
  return CHANNEL_SESSIONS;
}

function resolveActionTypeId(payload: CompanionNotificationPayload): string {
  if (payload.category === "completion") return ACTION_TYPE_SESSION_COMPLETE;
  if (payload.category === "motivation") return ACTION_TYPE_MOTIVATION;
  return ACTION_TYPE_SESSION_ACTIVE;
}

function toLocalNotificationSchema(
  id: number,
  payload: CompanionNotificationPayload,
  scheduleAtMs?: number,
): LocalNotificationSchema {
  return {
    id,
    title: payload.title,
    body: payload.body,
    channelId: resolveChannelId(payload),
    actionTypeId: resolveActionTypeId(payload),
    smallIcon: "ic_stat_focus",
    iconColor: "#FF8A3D",
    ongoing: payload.category === "focus" && Boolean(payload.requireInteraction),
    autoCancel: !(payload.category === "focus" && Boolean(payload.requireInteraction)),
    extra: {
      url: payload.url,
      category: payload.category,
      sessionId: payload.sessionId ?? "",
      kind: payload.kind ?? "focus",
      minutes: payload.minutes ?? 0,
      action: payload.actions?.[0]?.action ?? "open_timer",
    },
    ...(scheduleAtMs !== undefined
      ? {
          schedule: {
            at: new Date(scheduleAtMs),
            allowWhileIdle: true,
          },
        }
      : {}),
  };
}

export async function showNativeLocalNotification(
  payload: CompanionNotificationPayload,
): Promise<boolean> {
  if (!isCapacitorNative()) return false;
  await ensureNativeNotificationSetup();
  const perm = await refreshNativeNotificationPermission();
  if (perm !== "granted") return false;

  const id = payload.tag.startsWith("focus-test-")
    ? FOCUS_TEST_NOTIF_ID
    : hashTagToNotificationId(payload.tag);

  try {
    await LocalNotifications.schedule({
      notifications: [toLocalNotificationSchema(id, payload)],
    });
    return true;
  } catch {
    return false;
  }
}

export async function scheduleNativeSessionCompletion(params: {
  expectedEndAt: number;
  payload: CompanionNotificationPayload;
}): Promise<boolean> {
  if (!isCapacitorNative()) return false;
  if (params.expectedEndAt <= Date.now() + 1000) return false;

  await ensureNativeNotificationSetup();
  const perm = await refreshNativeNotificationPermission();
  if (perm !== "granted") return false;

  try {
    await LocalNotifications.cancel({
      notifications: [{ id: FOCUS_SCHEDULED_END_ID }],
    }).catch(() => {});

    await LocalNotifications.schedule({
      notifications: [
        toLocalNotificationSchema(FOCUS_SCHEDULED_END_ID, params.payload, params.expectedEndAt),
      ],
    });
    return true;
  } catch {
    return false;
  }
}

export async function cancelNativeSessionCompletion(): Promise<void> {
  if (!isCapacitorNative()) return;
  try {
    await LocalNotifications.cancel({
      notifications: [{ id: FOCUS_SCHEDULED_END_ID }],
    });
  } catch {
    // Ignore cancellation errors
  }
}

export async function closeNativeNotificationsByTag(tag: string): Promise<void> {
  if (!isCapacitorNative()) return;
  const id = hashTagToNotificationId(tag);
  try {
    await LocalNotifications.cancel({ notifications: [{ id }] });
    const delivered = await LocalNotifications.getDeliveredNotifications();
    const matching = delivered.notifications.filter((n) => n.id === id);
    if (matching.length > 0) {
      await LocalNotifications.removeDeliveredNotifications({ notifications: matching });
    }
  } catch {
    // Ignore errors
  }
}

export async function scheduleNativeDailyMotivationReminders(
  prefs: NotificationPreferences,
): Promise<void> {
  if (!isCapacitorNative()) return;

  const idsToCancel = Array.from({ length: FOCUS_MOTIVATION_MAX_SLOTS }, (_, i) => ({
    id: FOCUS_MOTIVATION_BASE_ID + i,
  }));
  try {
    await LocalNotifications.cancel({ notifications: idsToCancel });
  } catch {
    // Ignore missing IDs
  }

  if (!prefs.enabled || !prefs.dailyMotivation) return;
  const perm = await refreshNativeNotificationPermission();
  if (perm !== "granted") return;

  await ensureNativeNotificationSetup();
  const slots = getEffectiveReminderSlots(prefs);
  if (slots.length === 0) return;

  const now = new Date();
  const scheduled: LocalNotificationSchema[] = [];
  let recentIds = [...prefs.recentMessageIds];
  let slotIndex = 0;

  for (let dayOffset = 0; dayOffset < 7 && slotIndex < FOCUS_MOTIVATION_MAX_SLOTS; dayOffset++) {
    const baseDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset);
    const weekday = baseDate.getDay();
    if (!prefs.activeWeekdays.includes(weekday)) continue;

    const yyyy = baseDate.getFullYear();
    const mm = String(baseDate.getMonth() + 1).padStart(2, "0");
    const dd = String(baseDate.getDate()).padStart(2, "0");
    const dayKey = `${yyyy}-${mm}-${dd}`;

    for (const slot of slots) {
      if (slotIndex >= FOCUS_MOTIVATION_MAX_SLOTS) break;
      if (prefs.quietHoursEnabled && isWithinQuietHours(slot.time, prefs.quietStart, prefs.quietEnd)) {
        continue;
      }
      const [hStr, mStr] = slot.time.split(":");
      const target = new Date(
        baseDate.getFullYear(),
        baseDate.getMonth(),
        baseDate.getDate(),
        Number(hStr ?? 9),
        Number(mStr ?? 0),
        0,
        0,
      );
      if (target.getTime() <= Date.now() + 5000) continue;

      const picked = pickMotivationalMessage(recentIds, slot.windowHint);
      recentIds = picked.nextRecentIds;
      const payload = buildMotivationPayload({
        dayKey,
        slotId: slot.slotId,
        message: picked.message,
        sound: prefs.sound,
      });
      scheduled.push(
        toLocalNotificationSchema(
          FOCUS_MOTIVATION_BASE_ID + slotIndex,
          payload,
          target.getTime(),
        ),
      );
      slotIndex++;
    }
  }

  if (scheduled.length > 0) {
    try {
      await LocalNotifications.schedule({ notifications: scheduled });
    } catch {
      // Ignore scheduling errors if alarm permission is restricted
    }
  }
}

export async function registerNativeNotificationActionListener(
  onAction: (action: string, extra: Record<string, unknown>) => void,
): Promise<() => void> {
  if (!isCapacitorNative()) return () => {};
  try {
    const handle = await LocalNotifications.addListener(
      "localNotificationActionPerformed",
      (event: ActionPerformed) => {
        const extra = (event.notification.extra ?? {}) as Record<string, unknown>;
        const actionId =
          event.actionId && event.actionId !== "tap"
            ? event.actionId
            : typeof extra["action"] === "string"
              ? extra["action"]
              : "open_timer";
        onAction(actionId, extra);
      },
    );
    return () => {
      void handle.remove();
    };
  } catch {
    return () => {};
  }
}

export async function hideNativeSplashScreen(): Promise<void> {
  if (!isCapacitorNative() || splashHidden) return;
  splashHidden = true;
  try {
    await SplashScreen.hide({ fadeOutDuration: 220 });
  } catch {
    // Ignore
  }
}

export async function syncNativeStatusBar(options: {
  dark: boolean;
  backgroundColor?: string;
}): Promise<void> {
  if (!isCapacitorNative()) return;
  try {
    await StatusBar.setStyle({ style: options.dark ? Style.Dark : Style.Light });
    if (isCapacitorAndroid() && options.backgroundColor) {
      await StatusBar.setBackgroundColor({ color: options.backgroundColor });
    }
  } catch {
    // StatusBar may be unsupported in some contexts
  }
}

export async function setNativeImmersiveStatusBar(immersive: boolean, dark: boolean): Promise<void> {
  if (!isCapacitorNative()) return;
  try {
    if (immersive) {
      await StatusBar.hide();
    } else {
      await StatusBar.show();
      await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light });
    }
  } catch {
    // Ignore
  }
}

export async function triggerNativeHaptic(
  kind: "light" | "medium" | "success" | "warning",
): Promise<void> {
  if (!isCapacitorNative()) return;
  try {
    if (kind === "light") {
      await Haptics.impact({ style: ImpactStyle.Light });
    } else if (kind === "medium") {
      await Haptics.impact({ style: ImpactStyle.Medium });
    } else if (kind === "success") {
      await Haptics.notification({ type: NotificationType.Success });
    } else {
      await Haptics.notification({ type: NotificationType.Warning });
    }
  } catch {
    // Ignore on devices without vibrator
  }
}

export async function getNativeOrientationIsLandscape(): Promise<boolean | null> {
  if (!isCapacitorNative()) return null;
  try {
    const res = await ScreenOrientation.orientation();
    return res.type.startsWith("landscape");
  } catch {
    return null;
  }
}

export async function lockNativeLandscape(): Promise<boolean> {
  if (!isCapacitorNative()) return false;
  try {
    await ScreenOrientation.lock({ orientation: "landscape" });
    return true;
  } catch {
    return false;
  }
}

export async function unlockNativeOrientation(): Promise<void> {
  if (!isCapacitorNative()) return;
  try {
    await ScreenOrientation.unlock();
  } catch {
    // Ignore
  }
}

export async function registerNativeOrientationListener(
  onChange: (isLandscape: boolean) => void,
): Promise<() => void> {
  if (!isCapacitorNative()) return () => {};
  try {
    const handle = await ScreenOrientation.addListener("screenOrientationChange", (res) => {
      onChange(res.type.startsWith("landscape"));
    });
    return () => {
      void handle.remove();
    };
  } catch {
    return () => {};
  }
}

export async function registerNativeAppLifecycle(handlers: {
  onResume?: () => void;
  onPause?: () => void;
  onBackButton?: (event: BackButtonListenerEvent) => void;
}): Promise<() => void> {
  if (!isCapacitorNative()) return () => {};
  const removers: Array<() => Promise<void>> = [];
  try {
    if (handlers.onResume || handlers.onPause) {
      const stateHandle = await App.addListener("appStateChange", (state) => {
        if (state.isActive) {
          handlers.onResume?.();
        } else {
          handlers.onPause?.();
        }
      });
      removers.push(() => stateHandle.remove());
    }

    if (handlers.onBackButton) {
      const backHandle = await App.addListener("backButton", (ev) => {
        handlers.onBackButton?.(ev);
      });
      removers.push(() => backHandle.remove());
    }
  } catch {
    // Ignore listener setup errors
  }

  return () => {
    for (const remove of removers) {
      void remove();
    }
  };
}

export async function minimizeNativeApp(): Promise<void> {
  if (!isCapacitorNative()) return;
  try {
    await App.minimizeApp();
  } catch {
    // Ignore
  }
}
