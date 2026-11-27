export type NotificationCategory = "focus" | "motivation" | "completion" | "break";

export type NotificationPermissionState = "unsupported" | "default" | "granted" | "denied";

export interface NotificationPreferences {
  enabled: boolean;
  sessionOngoing: boolean;
  sessionCompletion: boolean;
  dailyMotivation: boolean;
  breakReminders: boolean;
  dailyCount: 1 | 2 | 3;
  morningTime: string;
  afternoonTime: string;
  eveningTime: string;
  customTimes: string[];
  quietHoursEnabled: boolean;
  quietStart: string;
  quietEnd: string;
  activeWeekdays: number[]; // 0 = Sunday .. 6 = Saturday
  sound: boolean;
  timezone: string;
  onboardingCompleted: boolean;
  onboardingDismissed: boolean;
  recentMessageIds: string[];
  updatedAt: number;
}

export interface MotivationMessage {
  id: string;
  text: string;
  windowHint?: "morning" | "afternoon" | "evening" | "any";
}

export const MASCOT_ASSETS: Record<NotificationCategory, string> = {
  focus: "/mascots/focus.jpg",
  motivation: "/mascots/motivation.jpg",
  completion: "/mascots/complete.jpg",
  break: "/mascots/break.jpg",
};

export const NOTIFICATION_COLORS = {
  warmOrange: "#FF8A3D",
  softPink: "#FAD4D8",
  offWhite: "#FAF6F0",
  ink: "#231F1A",
} as const;

export const SUGGESTED_REMINDER_TIMES = {
  morning: "09:00",
  afternoon: "14:00",
  evening: "20:00",
} as const;

export const COMMON_TIMEZONES: string[] = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Amsterdam",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Dhaka",
  "Asia/Bangkok",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Australia/Sydney",
  "Pacific/Auckland",
];

export const MOTIVATION_MESSAGES: MotivationMessage[] = [
  { id: "m01", text: "Good morning! A fresh day is waiting for you.", windowHint: "morning" },
  {
    id: "m02",
    text: "Hey, where are you? Let's make something meaningful today.",
    windowHint: "any",
  },
  {
    id: "m03",
    text: "People are doing great things. Your journey matters too.",
    windowHint: "any",
  },
  { id: "m04", text: "Just 25 minutes. That's all you need to get started.", windowHint: "any" },
  { id: "m05", text: "Stop waiting for motivation. Start small.", windowHint: "any" },
  {
    id: "m06",
    text: "Your future self will thank you for today's effort.",
    windowHint: "any",
  },
  { id: "m07", text: "One task. One session. One step forward.", windowHint: "any" },
  { id: "m08", text: "You don't need a perfect day to make progress.", windowHint: "any" },
  { id: "m09", text: "A little progress is still progress.", windowHint: "any" },
  { id: "m10", text: "Let's make today count!", windowHint: "morning" },
  {
    id: "m11",
    text: "Hey! Your dreams deserve a little attention today.",
    windowHint: "any",
  },
  {
    id: "m12",
    text: "Quiet minutes add up into something you'll be proud of.",
    windowHint: "any",
  },
  {
    id: "m13",
    text: "Pick just one small thing and give it a calm 15 minutes.",
    windowHint: "any",
  },
  {
    id: "m14",
    text: "Take a breath, clear a tab, and begin gently.",
    windowHint: "morning",
  },
  {
    id: "m15",
    text: "You don't have to finish everything—just start the next piece.",
    windowHint: "any",
  },
  {
    id: "m16",
    text: "Afternoon reset: one short session can turn the whole day warm.",
    windowHint: "afternoon",
  },
  {
    id: "m17",
    text: "Momentum loves company. Let's light up one focus ring!",
    windowHint: "any",
  },
  {
    id: "m18",
    text: "Tiny habits built with kindness go the farthest.",
    windowHint: "any",
  },
  {
    id: "m19",
    text: "Ready when you are. Your quiet workspace is waiting.",
    windowHint: "any",
  },
  {
    id: "m20",
    text: "Even ten calm minutes beats waiting for the ideal hour.",
    windowHint: "any",
  },
  {
    id: "m21",
    text: "Give your best idea a cozy 25-minute home today.",
    windowHint: "any",
  },
  {
    id: "m22",
    text: "Slow is smooth, and smooth turns into steady progress.",
    windowHint: "any",
  },
  {
    id: "m23",
    text: "Morning energy check: what's one thing worth doing well?",
    windowHint: "morning",
  },
  {
    id: "m24",
    text: "Halfway through the day—a gentle focus block feels great right now.",
    windowHint: "afternoon",
  },
  {
    id: "m25",
    text: "Evening wind-down: wrap up one loose end before you rest.",
    windowHint: "evening",
  },
  {
    id: "m26",
    text: "You showed up, and showing up is half the magic.",
    windowHint: "any",
  },
  {
    id: "m27",
    text: "Leave distractions at the door for one calm sprint.",
    windowHint: "any",
  },
  {
    id: "m28",
    text: "Curiosity works best in quiet bursts. Let's explore!",
    windowHint: "any",
  },
  {
    id: "m29",
    text: "Put on a cozy soundscape and let the timer hold the clock for you.",
    windowHint: "any",
  },
  {
    id: "m30",
    text: "Every great project began with one ordinary Tuesday session.",
    windowHint: "any",
  },
  {
    id: "m31",
    text: "Be gentle with yourself—steady beats frantic every time.",
    windowHint: "any",
  },
  {
    id: "m32",
    text: "What's one task that will make tonight feel lighter?",
    windowHint: "afternoon",
  },
  {
    id: "m33",
    text: "Your focus companion is cheering for your next 25 minutes!",
    windowHint: "any",
  },
  {
    id: "m34",
    text: "Start messy, stay curious, and celebrate finishing.",
    windowHint: "any",
  },
  {
    id: "m35",
    text: "A calm mind builds things that last. Ready for a quick block?",
    windowHint: "any",
  },
  {
    id: "m36",
    text: "No pressure, just presence. One timer, one task.",
    windowHint: "any",
  },
  {
    id: "m37",
    text: "Small sparks keep the streak warm—let's do a quick session!",
    windowHint: "any",
  },
  {
    id: "m38",
    text: "Tonight's calm effort makes tomorrow morning so much easier.",
    windowHint: "evening",
  },
  {
    id: "m39",
    text: "Close the noisy tabs. Let's spend a peaceful block together.",
    windowHint: "any",
  },
  {
    id: "m40",
    text: "You're closer than you think—one focused round at a time.",
    windowHint: "any",
  },
  {
    id: "m41",
    text: "Trade multitasking for one clear win right now.",
    windowHint: "any",
  },
  {
    id: "m42",
    text: "A fresh cup of focus awaits—25 quiet minutes, just for you.",
    windowHint: "morning",
  },
  {
    id: "m43",
    text: "Celebrate small starts. Press start and see where 15 minutes goes!",
    windowHint: "any",
  },
  {
    id: "m44",
    text: "Your pace is the right pace. Let's take one calm step.",
    windowHint: "any",
  },
];

export function detectDeviceTimezone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && isValidTimezone(tz)) return tz;
  } catch {
    // Fallback to UTC
  }
  return "UTC";
}

export function isValidTimezone(tz: string): boolean {
  if (!tz || typeof tz !== "string" || tz.length > 80) return false;
  try {
    Intl.DateTimeFormat("en-US", { timeZone: tz }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function isValidHHMM(value: string): boolean {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
}

export function normalizeHHMM(value: string, fallback: string): string {
  return isValidHHMM(value) ? value : fallback;
}

export function defaultNotificationPreferences(timezone?: string): NotificationPreferences {
  return {
    enabled: false,
    sessionOngoing: true,
    sessionCompletion: true,
    dailyMotivation: true,
    breakReminders: true,
    dailyCount: 2,
    morningTime: SUGGESTED_REMINDER_TIMES.morning,
    afternoonTime: SUGGESTED_REMINDER_TIMES.afternoon,
    eveningTime: SUGGESTED_REMINDER_TIMES.evening,
    customTimes: [],
    quietHoursEnabled: true,
    quietStart: "22:00",
    quietEnd: "07:00",
    activeWeekdays: [0, 1, 2, 3, 4, 5, 6],
    sound: true,
    timezone: timezone && isValidTimezone(timezone) ? timezone : detectDeviceTimezone(),
    onboardingCompleted: false,
    onboardingDismissed: false,
    recentMessageIds: [],
    updatedAt: Date.now(),
  };
}

export function sanitizeNotificationPreferences(
  raw: Partial<NotificationPreferences> | null | undefined,
): NotificationPreferences {
  const base = defaultNotificationPreferences();
  if (!raw || typeof raw !== "object") return base;

  const dailyCount: 1 | 2 | 3 = raw.dailyCount === 1 || raw.dailyCount === 3 ? raw.dailyCount : 2;

  const weekdays = Array.isArray(raw.activeWeekdays)
    ? Array.from(
        new Set(
          raw.activeWeekdays.filter(
            (d): d is number => typeof d === "number" && Number.isInteger(d) && d >= 0 && d <= 6,
          ),
        ),
      ).sort((a, b) => a - b)
    : base.activeWeekdays;

  const customTimes = Array.isArray(raw.customTimes)
    ? Array.from(
        new Set(
          raw.customTimes.filter((t): t is string => typeof t === "string" && isValidHHMM(t)),
        ),
      ).slice(0, 3)
    : [];

  const recentMessageIds = Array.isArray(raw.recentMessageIds)
    ? raw.recentMessageIds
        .filter((id): id is string => typeof id === "string" && id.length <= 16)
        .slice(-20)
    : [];

  return {
    enabled: Boolean(raw.enabled),
    sessionOngoing:
      raw.sessionOngoing !== undefined ? Boolean(raw.sessionOngoing) : base.sessionOngoing,
    sessionCompletion:
      raw.sessionCompletion !== undefined ? Boolean(raw.sessionCompletion) : base.sessionCompletion,
    dailyMotivation:
      raw.dailyMotivation !== undefined ? Boolean(raw.dailyMotivation) : base.dailyMotivation,
    breakReminders:
      raw.breakReminders !== undefined ? Boolean(raw.breakReminders) : base.breakReminders,
    dailyCount,
    morningTime: normalizeHHMM(String(raw.morningTime ?? ""), base.morningTime),
    afternoonTime: normalizeHHMM(String(raw.afternoonTime ?? ""), base.afternoonTime),
    eveningTime: normalizeHHMM(String(raw.eveningTime ?? ""), base.eveningTime),
    customTimes,
    quietHoursEnabled:
      raw.quietHoursEnabled !== undefined ? Boolean(raw.quietHoursEnabled) : base.quietHoursEnabled,
    quietStart: normalizeHHMM(String(raw.quietStart ?? ""), base.quietStart),
    quietEnd: normalizeHHMM(String(raw.quietEnd ?? ""), base.quietEnd),
    activeWeekdays: weekdays,
    sound: raw.sound !== undefined ? Boolean(raw.sound) : base.sound,
    timezone:
      typeof raw.timezone === "string" && isValidTimezone(raw.timezone)
        ? raw.timezone
        : base.timezone,
    onboardingCompleted: Boolean(raw.onboardingCompleted),
    onboardingDismissed: Boolean(raw.onboardingDismissed),
    recentMessageIds,
    updatedAt:
      typeof raw.updatedAt === "number" && Number.isFinite(raw.updatedAt)
        ? raw.updatedAt
        : Date.now(),
  };
}

export interface LocalTimezoneParts {
  dayKey: string; // YYYY-MM-DD
  weekday: number; // 0 = Sun .. 6 = Sat
  hour: number;
  minute: number;
  hhmm: string;
  minutesSinceMidnight: number;
}

const WEEKDAY_MAP: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export function getLocalPartsInTimezone(timestampMs: number, timeZone: string): LocalTimezoneParts {
  const safeTz = isValidTimezone(timeZone) ? timeZone : "UTC";
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: safeTz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = fmt.formatToParts(new Date(timestampMs));
  const lookup = new Map<string, string>();
  for (const p of parts) {
    if (p.type !== "literal") lookup.set(p.type, p.value);
  }
  const year = lookup.get("year") ?? "1970";
  const month = lookup.get("month") ?? "01";
  const day = lookup.get("day") ?? "01";
  const weekdayStr = lookup.get("weekday") ?? "Sun";
  const hour = Number(lookup.get("hour") ?? "0") % 24;
  const minute = Number(lookup.get("minute") ?? "0") % 60;
  const hhmm = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  return {
    dayKey: `${year}-${month}-${day}`,
    weekday: WEEKDAY_MAP[weekdayStr] ?? 0,
    hour,
    minute,
    hhmm,
    minutesSinceMidnight: hour * 60 + minute,
  };
}

export function hhmmToMinutes(hhmm: string): number {
  const [hStr, mStr] = hhmm.split(":");
  const h = Number(hStr ?? 0);
  const m = Number(mStr ?? 0);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h * 60 + m;
}

export function isWithinQuietHours(hhmm: string, quietStart: string, quietEnd: string): boolean {
  const current = hhmmToMinutes(hhmm);
  const start = hhmmToMinutes(quietStart);
  const end = hhmmToMinutes(quietEnd);
  if (start === end) return false;
  if (start < end) {
    return current >= start && current < end;
  }
  // Overnight quiet hours (e.g. 22:00 to 07:00)
  return current >= start || current < end;
}

export interface ReminderSlot {
  slotId: string;
  label: string;
  time: string;
  windowHint: "morning" | "afternoon" | "evening" | "any";
}

export function getEffectiveReminderSlots(prefs: NotificationPreferences): ReminderSlot[] {
  if (prefs.customTimes.length > 0) {
    const unique = Array.from(new Set(prefs.customTimes.filter(isValidHHMM))).sort();
    return unique.slice(0, prefs.dailyCount).map((time, idx) => ({
      slotId: `custom_${idx + 1}`,
      label: `Custom #${idx + 1}`,
      time,
      windowHint:
        hhmmToMinutes(time) < 12 * 60
          ? "morning"
          : hhmmToMinutes(time) < 17 * 60
            ? "afternoon"
            : "evening",
    }));
  }

  const slots: ReminderSlot[] = [];
  if (prefs.dailyCount === 1) {
    slots.push({
      slotId: "morning",
      label: "Morning",
      time: prefs.morningTime,
      windowHint: "morning",
    });
  } else if (prefs.dailyCount === 2) {
    slots.push(
      { slotId: "morning", label: "Morning", time: prefs.morningTime, windowHint: "morning" },
      { slotId: "evening", label: "Evening", time: prefs.eveningTime, windowHint: "evening" },
    );
  } else {
    slots.push(
      { slotId: "morning", label: "Morning", time: prefs.morningTime, windowHint: "morning" },
      {
        slotId: "afternoon",
        label: "Afternoon",
        time: prefs.afternoonTime,
        windowHint: "afternoon",
      },
      { slotId: "evening", label: "Evening", time: prefs.eveningTime, windowHint: "evening" },
    );
  }
  return slots;
}

export function pickMotivationalMessage(
  recentIds: string[] = [],
  windowHint: "morning" | "afternoon" | "evening" | "any" = "any",
  randomFn: () => number = Math.random,
): { message: MotivationMessage; nextRecentIds: string[] } {
  const recentSet = new Set(recentIds.slice(-15));
  let pool = MOTIVATION_MESSAGES.filter((m) => !recentSet.has(m.id));
  if (pool.length === 0) {
    pool = MOTIVATION_MESSAGES;
  }

  if (windowHint !== "any") {
    const hinted = pool.filter((m) => m.windowHint === windowHint || m.windowHint === "any");
    if (hinted.length > 0) pool = hinted;
  }

  const idx = Math.min(pool.length - 1, Math.max(0, Math.floor(randomFn() * pool.length)));
  const chosen = pool[idx] ?? MOTIVATION_MESSAGES[0]!;
  const nextRecentIds = [...recentIds.filter((id) => id !== chosen.id), chosen.id].slice(-15);
  return { message: chosen, nextRecentIds };
}

export function formatTimeInZone(timestampMs: number, timeZone: string): string {
  const safeTz = isValidTimezone(timeZone) ? timeZone : "UTC";
  try {
    return new Intl.DateTimeFormat(undefined, {
      timeZone: safeTz,
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(timestampMs));
  } catch {
    return "";
  }
}

export function formatHHMM12Hour(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(":");
  const h = Number(hStr ?? 0);
  const m = Number(mStr ?? 0);
  const suffix = h >= 12 ? "PM" : "AM";
  const hr12 = h % 12 === 0 ? 12 : h % 12;
  return `${hr12}:${String(m).padStart(2, "0")} ${suffix}`;
}

export interface NotificationActionSpec {
  action: "open_timer" | "open_completion" | "start_focus" | "start_break" | "dismiss";
  title: string;
}

export interface CompanionNotificationPayload {
  category: NotificationCategory;
  title: string;
  body: string;
  tag: string;
  url: string;
  icon: string;
  badge: string;
  image: string;
  requireInteraction?: boolean;
  renotify?: boolean;
  silent?: boolean;
  actions?: NotificationActionSpec[];
  sessionId?: string;
  scheduleVersion?: number;
  kind?: "focus" | "break";
  minutes?: number;
  dedupeKey?: string;
}

export function buildFocusStartPayload(params: {
  sessionId: string;
  scheduleVersion: number;
  minutes: number;
  remainingMinutes: number;
  endAt: number;
  label?: string;
  timezone: string;
}): CompanionNotificationPayload {
  const task = params.label?.trim();
  const endClock = formatTimeInZone(params.endAt, params.timezone);
  const title = task ? `Focusing: ${task}` : "Focus session active";
  const body = `Time to focus! ${params.minutes}m planned · ${params.remainingMinutes}m remaining${endClock ? ` (ends ~${endClock})` : ""}.`;
  return {
    category: "focus",
    title,
    body,
    tag: "focus-active-session",
    url: "/?action=open_timer",
    icon: "/pwa-192x192.png",
    badge: "/pwa-192x192.png",
    image: MASCOT_ASSETS.focus,
    requireInteraction: true,
    renotify: false,
    silent: true,
    actions: [
      { action: "open_timer", title: "Open Timer" },
      { action: "dismiss", title: "Dismiss" },
    ],
    sessionId: params.sessionId,
    scheduleVersion: params.scheduleVersion,
    kind: "focus",
    minutes: params.minutes,
  };
}

export function buildFocusPausedPayload(params: {
  sessionId: string;
  scheduleVersion: number;
  remainingMinutes: number;
  label?: string;
}): CompanionNotificationPayload {
  const task = params.label?.trim();
  return {
    category: "focus",
    title: task ? `Paused: ${task}` : "Focus session paused",
    body: `${params.remainingMinutes}m remaining. Tap to open the timer when you're ready to resume.`,
    tag: "focus-active-session",
    url: "/?action=open_timer",
    icon: "/pwa-192x192.png",
    badge: "/pwa-192x192.png",
    image: MASCOT_ASSETS.focus,
    requireInteraction: false,
    renotify: false,
    silent: true,
    actions: [
      { action: "open_timer", title: "Open Timer" },
      { action: "dismiss", title: "Dismiss" },
    ],
    sessionId: params.sessionId,
    scheduleVersion: params.scheduleVersion,
    kind: "focus",
  };
}

export function buildSessionCompletePayload(params: {
  sessionId: string;
  minutes: number;
  label?: string;
  sound?: boolean;
}): CompanionNotificationPayload {
  const task = params.label?.trim();
  const body = task
    ? `You did it! You spent ${params.minutes} minutes focusing on "${task}". Take a little break.`
    : `You did it! You spent ${params.minutes} minutes focusing. Take a little break.`;
  return {
    category: "completion",
    title: "Your focus session is complete!",
    body,
    tag: `focus-complete-${params.sessionId}`,
    dedupeKey: `complete:${params.sessionId}`,
    url: "/?action=open_completion",
    icon: "/pwa-192x192.png",
    badge: "/pwa-192x192.png",
    image: MASCOT_ASSETS.completion,
    requireInteraction: true,
    renotify: true,
    silent: params.sound === false,
    actions: [
      { action: "open_completion", title: "Open Summary" },
      { action: "start_break", title: "Take Break" },
    ],
    sessionId: params.sessionId,
    kind: "focus",
    minutes: params.minutes,
  };
}

export function buildBreakStartPayload(params: {
  sessionId: string;
  scheduleVersion: number;
  minutes: number;
  endAt: number;
  timezone: string;
}): CompanionNotificationPayload {
  const endClock = formatTimeInZone(params.endAt, params.timezone);
  return {
    category: "break",
    title: `Break time · ${params.minutes}m`,
    body: `You've earned a little break. Stretch and relax${endClock ? ` until ~${endClock}` : ""}.`,
    tag: "focus-active-session",
    url: "/?action=open_timer",
    icon: "/pwa-192x192.png",
    badge: "/pwa-192x192.png",
    image: MASCOT_ASSETS.break,
    requireInteraction: false,
    renotify: false,
    silent: true,
    actions: [
      { action: "open_timer", title: "Open Timer" },
      { action: "dismiss", title: "Dismiss" },
    ],
    sessionId: params.sessionId,
    scheduleVersion: params.scheduleVersion,
    kind: "break",
    minutes: params.minutes,
  };
}

export function buildBreakCompletePayload(params: {
  sessionId: string;
  minutes: number;
  sound?: boolean;
}): CompanionNotificationPayload {
  return {
    category: "break",
    title: "Break complete!",
    body: `Your ${params.minutes}-minute break is over. Ready to start your next focus session?`,
    tag: `focus-break-complete-${params.sessionId}`,
    dedupeKey: `break:${params.sessionId}`,
    url: "/?action=open_timer",
    icon: "/pwa-192x192.png",
    badge: "/pwa-192x192.png",
    image: MASCOT_ASSETS.break,
    requireInteraction: true,
    renotify: true,
    silent: params.sound === false,
    actions: [
      { action: "start_focus", title: "Start Focus" },
      { action: "open_timer", title: "Open Timer" },
    ],
    sessionId: params.sessionId,
    kind: "break",
    minutes: params.minutes,
  };
}

export function buildMotivationPayload(params: {
  dayKey: string;
  slotId: string;
  message: MotivationMessage;
  sound?: boolean;
}): CompanionNotificationPayload {
  return {
    category: "motivation",
    title: "Focus Companion",
    body: params.message.text,
    tag: `focus-motivation-${params.dayKey}-${params.slotId}`,
    dedupeKey: `motivation:${params.dayKey}:${params.slotId}`,
    url: "/?action=open_timer",
    icon: "/pwa-192x192.png",
    badge: "/pwa-192x192.png",
    image: MASCOT_ASSETS.motivation,
    requireInteraction: false,
    renotify: false,
    silent: params.sound === false,
    actions: [
      { action: "start_focus", title: "Start Focus" },
      { action: "dismiss", title: "Dismiss" },
    ],
  };
}
