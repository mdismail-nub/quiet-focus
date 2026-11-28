import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import {
  Bell,
  BellOff,
  Clock,
  Globe,
  Plus,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  WifiOff,
} from "lucide-react";
import { useFocus } from "@/lib/focus-store";
import {
  COMMON_TIMEZONES,
  SUGGESTED_REMINDER_TIMES,
  detectDeviceTimezone,
  formatHHMM12Hour,
  isValidHHMM,
  type NotificationCategory,
  type NotificationPermissionState,
} from "@/lib/notifications-core";
import { NotificationMascot, NotificationPreviewCard } from "@/components/NotificationMascot";
import { NotificationOnboarding } from "@/components/NotificationOnboarding";
import { Card, Header, PillButton } from "@/components/ui-kit";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/notifications")({
  head: () => ({
    meta: [
      { title: "Notifications — Focus" },
      {
        name: "description",
        content: "Manage focus session, daily motivation, break alerts, quiet hours and timezone.",
      },
      { property: "og:title", content: "Notifications — Focus" },
      {
        property: "og:description",
        content: "Manage focus session, daily motivation, break alerts, quiet hours and timezone.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: NotificationsScreen,
});

const WEEKDAYS = [
  { day: 0, short: "Sun" },
  { day: 1, short: "Mon" },
  { day: 2, short: "Tue" },
  { day: 3, short: "Wed" },
  { day: 4, short: "Thu" },
  { day: 5, short: "Fri" },
  { day: 6, short: "Sat" },
];

const PREVIEW_TABS: { id: NotificationCategory; label: string }[] = [
  { id: "focus", label: "Focus" },
  { id: "motivation", label: "Motivation" },
  { id: "completion", label: "Completion" },
  { id: "break", label: "Break" },
];

function permissionBadgeInfo(state: NotificationPermissionState): {
  label: "Not requested" | "Enabled" | "Denied" | "Unsupported";
  tone: string;
} {
  switch (state) {
    case "granted":
      return {
        label: "Enabled",
        tone: "border-primary/35 bg-primary-soft text-foreground",
      };
    case "denied":
      return {
        label: "Denied",
        tone: "border-coral/35 bg-coral/12 text-foreground",
      };
    case "unsupported":
      return {
        label: "Unsupported",
        tone: "border-border bg-secondary text-muted-foreground",
      };
    default:
      return {
        label: "Not requested",
        tone: "border-border bg-secondary text-foreground",
      };
  }
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string | undefined;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-14 items-center justify-between gap-4 border-b border-border py-3 last:border-0">
      <div className="min-w-0">
        <span className="block text-[15px]">{label}</span>
        {hint && <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function Toggle({
  on,
  onChange,
  label,
  disabled,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean | undefined;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={cn(
        "press relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-40",
        on ? "bg-primary" : "bg-track",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 left-0.5 size-6 rounded-full bg-card shadow-sm transition-transform",
          on && "translate-x-5",
        )}
      />
    </button>
  );
}

export function NotificationsScreen() {
  const f = useFocus();
  const p = f.notificationPrefs;
  const perm = f.notificationPermission;
  const badge = permissionBadgeInfo(perm);

  const [browserOnline, setBrowserOnline] = useState(() =>
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    typeof navigator.onLine === "boolean"
      ? navigator.onLine
      : true,
  );
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [enabling, setEnabling] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [customTimeInput, setCustomTimeInput] = useState("11:30");
  const [customTimeNotice, setCustomTimeNotice] = useState<string | null>(null);
  const [previewCategory, setPreviewCategory] = useState<NotificationCategory>("focus");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  useEffect(() => {
    const syncOnline = () => setBrowserOnline(navigator.onLine !== false);
    syncOnline();
    window.addEventListener("online", syncOnline);
    window.addEventListener("offline", syncOnline);
    return () => {
      window.removeEventListener("online", syncOnline);
      window.removeEventListener("offline", syncOnline);
    };
  }, []);

  const isOffline = !browserOnline || !f.serverOnline;
  const deviceTz = detectDeviceTimezone();
  const timezoneChoices = COMMON_TIMEZONES.includes(p.timezone)
    ? COMMON_TIMEZONES
    : [p.timezone, ...COMMON_TIMEZONES];

  const handleEnableNotifications = async () => {
    setActionMessage(null);
    if (perm === "denied" || perm === "unsupported") return;
    setEnabling(true);
    try {
      const res = await f.enableCompanionNotifications();
      if (!res.ok) {
        setActionMessage(
          res.error ?? "Notifications remain off. You can try again whenever you're ready.",
        );
      } else if (res.offline) {
        setActionMessage(
          "Notifications enabled on this device. Background push scheduling will connect when online.",
        );
      } else {
        setActionMessage("Focus Companion notifications are enabled.");
      }
    } catch {
      setActionMessage("Could not enable notifications right now. Please try again.");
    } finally {
      setEnabling(false);
    }
  };

  const handleMasterToggle = async (next: boolean) => {
    setActionMessage(null);
    if (!next) {
      try {
        await f.disableCompanionNotifications();
      } catch {
        setActionMessage("Could not pause notifications cleanly. Preferences updated locally.");
      }
      return;
    }
    if (perm === "granted") {
      f.setNotificationPrefs({ enabled: true });
      return;
    }
    if (perm === "denied") {
      setActionMessage(
        "Browser permission is denied. Allow notifications in your browser's site settings first.",
      );
      return;
    }
    if (perm === "unsupported") {
      setActionMessage("Notifications are not supported in this browser.");
      return;
    }
    await handleEnableNotifications();
  };

  const toggleWeekday = (day: number) => {
    const exists = p.activeWeekdays.includes(day);
    const next = exists
      ? p.activeWeekdays.filter((d) => d !== day)
      : [...p.activeWeekdays, day].sort((a, b) => a - b);
    f.setNotificationPrefs({ activeWeekdays: next });
  };

  const addCustomTime = () => {
    setCustomTimeNotice(null);
    if (!isValidHHMM(customTimeInput)) {
      setCustomTimeNotice("Please pick a valid time.");
      return;
    }
    if (p.customTimes.includes(customTimeInput)) {
      setCustomTimeNotice(`${formatHHMM12Hour(customTimeInput)} is already added.`);
      return;
    }
    if (p.customTimes.length >= 3) {
      setCustomTimeNotice("You can add up to 3 custom reminder times.");
      return;
    }
    const next = [...p.customTimes, customTimeInput].sort();
    f.setNotificationPrefs({ customTimes: next });
  };

  const removeCustomTime = (time: string) => {
    setCustomTimeNotice(null);
    f.setNotificationPrefs({ customTimes: p.customTimes.filter((t) => t !== time) });
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await f.sendTestCompanionNotification();
      setTestResult(res.message);
    } catch {
      setTestResult("Could not send a test notification in this browser context.");
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="screen-in min-h-dvh pb-14">
      <Header back />
      <div className="mt-2 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight">Notifications</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Warm session pings, breaks, and daily encouragement.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOnboardingOpen(true)}
          className="press flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3.5 text-xs font-medium text-foreground hover:bg-secondary"
        >
          <Sparkles className="size-3.5 text-primary" />
          Guided setup
        </button>
      </div>

      {/* Permission & Connectivity Status */}
      <Card className="mt-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <NotificationMascot
              category={p.enabled && perm === "granted" ? "focus" : "motivation"}
              size="sm"
            />
            <div>
              <p className="text-sm font-semibold">Browser permission</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {perm === "granted"
                  ? f.pushSubscribed
                    ? "Ready for active sessions and background push reminders."
                    : "Ready for local notifications on this device."
                  : perm === "denied"
                    ? "Blocked in browser settings. Focus will never re-prompt automatically."
                    : perm === "unsupported"
                      ? "This browser does not expose the Notifications API."
                      : "We only ask for permission after you tap Enable below."}
              </p>
            </div>
          </div>
          <span
            data-testid="permission-status-badge"
            className={cn(
              "inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-xs font-semibold",
              badge.tone,
            )}
          >
            {badge.label}
          </span>
        </div>

        {f.notificationSupport.iosNeedsHomeScreen && (
          <div className="mt-3 rounded-2xl border border-border bg-secondary/50 p-3 text-xs text-muted-foreground">
            iOS requires adding this PWA to your Home Screen before Web Push notifications can be
            delivered.
          </div>
        )}

        {isOffline && (
          <div
            data-testid="offline-scheduling-notice"
            className="mt-3 flex items-start gap-2.5 rounded-2xl border border-primary/30 bg-primary-soft p-3 text-xs"
          >
            <WifiOff className="mt-0.5 size-4 shrink-0 text-primary" />
            <span>
              Background push scheduling is unavailable while offline. Your notification preferences
              are saved locally in IndexedDB and will sync automatically when back online.
            </span>
          </div>
        )}

        {!isOffline && f.pushSyncPending && (
          <p className="mt-3 text-xs text-muted-foreground">Syncing updated reminder schedule…</p>
        )}

        {perm === "default" && (
          <div className="mt-4">
            <PillButton onClick={() => void handleEnableNotifications()} disabled={enabling}>
              <span className="inline-flex items-center gap-2">
                <Bell className="size-4" />
                {enabling ? "Requesting permission…" : "Enable Focus Notifications"}
              </span>
            </PillButton>
          </div>
        )}

        {perm === "denied" && (
          <div className="mt-4 flex items-start gap-2.5 rounded-2xl border border-border bg-secondary/60 p-3 text-xs text-muted-foreground">
            <BellOff className="mt-0.5 size-4 shrink-0 text-coral" />
            <span>
              To turn notifications back on, open your browser&apos;s site permissions for this
              page, switch Notifications to Allow, and reload.
            </span>
          </div>
        )}

        {(actionMessage || f.notificationSyncError) && (
          <p className="mt-3 text-xs font-medium text-foreground">
            {actionMessage ?? f.notificationSyncError}
          </p>
        )}
      </Card>

      {/* Master & Category Controls */}
      <p className="mt-6 mb-2 px-1 text-xs font-medium text-muted-foreground">Categories</p>
      <Card className="py-1">
        <Row
          label="Enable all notifications"
          hint={p.enabled ? "Focus Companion alerts active" : "All companion notifications paused"}
        >
          <Toggle
            label="Enable all notifications"
            on={p.enabled && perm === "granted"}
            disabled={enabling || perm === "denied" || perm === "unsupported"}
            onChange={(v) => void handleMasterToggle(v)}
          />
        </Row>
        <Row
          label="Session completion notifications"
          hint="Congratulates you with total focused duration when a session ends"
        >
          <Toggle
            label="Session completion notifications"
            on={p.sessionCompletion}
            disabled={!p.enabled}
            onChange={(v) => f.setNotificationPrefs({ sessionCompletion: v })}
          />
        </Row>
        <Row
          label="Ongoing session notification"
          hint="Shows task & expected finish snapshot while focusing (no live countdown)"
        >
          <Toggle
            label="Ongoing session notification"
            on={p.sessionOngoing}
            disabled={!p.enabled}
            onChange={(v) => f.setNotificationPrefs({ sessionOngoing: v })}
          />
        </Row>
        <Row label="Daily motivational reminders" hint="Friendly, non-judgmental check-ins">
          <Toggle
            label="Daily motivational reminders"
            on={p.dailyMotivation}
            disabled={!p.enabled}
            onChange={(v) => f.setNotificationPrefs({ dailyMotivation: v })}
          />
        </Row>
        <Row
          label="Break reminders"
          hint="Offers a short break after focus & notifies when your break ends"
        >
          <Toggle
            label="Break reminders"
            on={p.breakReminders}
            disabled={!p.enabled}
            onChange={(v) => f.setNotificationPrefs({ breakReminders: v })}
          />
        </Row>
      </Card>

      {/* Daily Motivation Schedule */}
      <p className="mt-6 mb-2 px-1 text-xs font-medium text-muted-foreground">
        Daily motivational schedule
      </p>
      <Card className="py-1">
        <Row label="Daily reminder count" hint="Choose 1, 2, or 3 reminders per active day">
          <div
            className="flex shrink-0 rounded-full bg-secondary p-1"
            role="radiogroup"
            aria-label="Daily reminder count"
          >
            {([1, 2, 3] as const).map((count) => (
              <button
                key={count}
                type="button"
                role="radio"
                aria-checked={p.dailyCount === count}
                onClick={() => f.setNotificationPrefs({ dailyCount: count })}
                className={cn(
                  "press min-h-9 min-w-10 rounded-full px-3 text-sm tabular-nums",
                  p.dailyCount === count
                    ? "bg-card font-semibold shadow-sm"
                    : "text-muted-foreground",
                )}
              >
                {count}
              </button>
            ))}
          </div>
        </Row>

        <Row
          label="Morning reminder time"
          hint={`Suggested: ${formatHHMM12Hour(SUGGESTED_REMINDER_TIMES.morning)}`}
        >
          <input
            type="time"
            aria-label="Morning reminder time"
            value={p.morningTime}
            onChange={(e) => f.setNotificationPrefs({ morningTime: e.target.value })}
            className="min-h-11 rounded-xl border border-border bg-secondary/50 px-3 text-sm font-medium tabular-nums"
          />
        </Row>

        <Row
          label="Afternoon reminder time"
          hint={`Suggested: ${formatHHMM12Hour(SUGGESTED_REMINDER_TIMES.afternoon)}`}
        >
          <input
            type="time"
            aria-label="Afternoon reminder time"
            value={p.afternoonTime}
            onChange={(e) => f.setNotificationPrefs({ afternoonTime: e.target.value })}
            className="min-h-11 rounded-xl border border-border bg-secondary/50 px-3 text-sm font-medium tabular-nums"
          />
        </Row>

        <Row
          label="Evening reminder time"
          hint={`Suggested: ${formatHHMM12Hour(SUGGESTED_REMINDER_TIMES.evening)}`}
        >
          <input
            type="time"
            aria-label="Evening reminder time"
            value={p.eveningTime}
            onChange={(e) => f.setNotificationPrefs({ eveningTime: e.target.value })}
            className="min-h-11 rounded-xl border border-border bg-secondary/50 px-3 text-sm font-medium tabular-nums"
          />
        </Row>

        <div className="border-t border-border py-3.5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[15px]">Custom reminder times</p>
              <p className="text-xs text-muted-foreground">
                {p.customTimes.length > 0
                  ? "Overrides Morning/Afternoon/Evening slots when set"
                  : "Optional: add up to 3 exact times of your own"}
              </p>
            </div>
            {p.customTimes.length > 0 && (
              <button
                type="button"
                onClick={() => f.setNotificationPrefs({ customTimes: [] })}
                className="press min-h-9 rounded-full px-2.5 text-xs font-medium text-primary hover:bg-primary-soft"
              >
                Use windows
              </button>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              type="time"
              aria-label="New custom reminder time"
              value={customTimeInput}
              onChange={(e) => {
                setCustomTimeNotice(null);
                setCustomTimeInput(e.target.value);
              }}
              className="min-h-11 rounded-xl border border-border bg-secondary/50 px-3 text-sm font-medium tabular-nums"
            />
            <button
              type="button"
              onClick={addCustomTime}
              disabled={p.customTimes.length >= 3}
              className="press flex min-h-11 items-center gap-1.5 rounded-full border border-border bg-card px-3.5 text-xs font-semibold hover:bg-secondary disabled:opacity-40"
            >
              <Plus className="size-3.5" />
              Add time
            </button>
          </div>

          {customTimeNotice && (
            <p className="mt-2 text-xs text-muted-foreground">{customTimeNotice}</p>
          )}

          {p.customTimes.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {p.customTimes.map((t) => (
                <div
                  key={t}
                  className="flex min-h-10 items-center gap-2 rounded-full border border-border bg-secondary/60 px-3 text-xs font-medium tabular-nums"
                >
                  <Clock className="size-3.5 text-primary" />
                  <span>{formatHHMM12Hour(t)}</span>
                  <button
                    type="button"
                    aria-label={`Remove custom time ${t}`}
                    onClick={() => removeCustomTime(t)}
                    className="press -mr-1 flex size-7 items-center justify-center rounded-full text-muted-foreground hover:text-coral"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      {/* Quiet Hours, Weekdays, Sound & Timezone */}
      <p className="mt-6 mb-2 px-1 text-xs font-medium text-muted-foreground">
        Quiet hours &amp; delivery
      </p>
      <Card className="py-1">
        <Row label="Quiet hours" hint="Suppresses daily reminders while resting">
          <Toggle
            label="Quiet hours"
            on={p.quietHoursEnabled}
            onChange={(v) => f.setNotificationPrefs({ quietHoursEnabled: v })}
          />
        </Row>

        {p.quietHoursEnabled && (
          <div className="grid grid-cols-2 gap-3 border-b border-border py-3.5">
            <label className="block">
              <span className="mb-1 block text-xs text-muted-foreground">Quiet starts</span>
              <input
                type="time"
                aria-label="Quiet hours start"
                value={p.quietStart}
                onChange={(e) => f.setNotificationPrefs({ quietStart: e.target.value })}
                className="min-h-11 w-full rounded-xl border border-border bg-secondary/50 px-3 text-sm font-medium tabular-nums"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-muted-foreground">Quiet ends</span>
              <input
                type="time"
                aria-label="Quiet hours end"
                value={p.quietEnd}
                onChange={(e) => f.setNotificationPrefs({ quietEnd: e.target.value })}
                className="min-h-11 w-full rounded-xl border border-border bg-secondary/50 px-3 text-sm font-medium tabular-nums"
              />
            </label>
          </div>
        )}

        <div className="border-b border-border py-3.5">
          <p className="text-[15px]">Active weekdays</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Daily motivation reminders only fire on selected days
          </p>
          <div className="mt-3 grid grid-cols-7 gap-1.5" role="group" aria-label="Active weekdays">
            {WEEKDAYS.map((w) => {
              const active = p.activeWeekdays.includes(w.day);
              return (
                <button
                  key={w.day}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleWeekday(w.day)}
                  className={cn(
                    "press flex min-h-11 items-center justify-center rounded-xl border text-xs font-semibold transition-colors",
                    active
                      ? "border-primary bg-primary-soft text-foreground"
                      : "border-border bg-secondary/40 text-muted-foreground",
                  )}
                >
                  {w.short}
                </button>
              );
            })}
          </div>
        </div>

        <Row
          label="Notification sound"
          hint="Plays a gentle chime when focus ends, a break starts, or alerts fire"
        >
          <Toggle
            label="Notification sound"
            on={p.sound}
            onChange={(v) => f.setNotificationPrefs({ sound: v })}
          />
        </Row>

        <div className="py-3.5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="flex items-center gap-1.5 text-[15px]">
                <Globe className="size-4 text-primary" />
                Timezone
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Automatically adjusts for Daylight Saving Time transitions.
              </p>
            </div>
            {p.timezone !== deviceTz && (
              <button
                type="button"
                onClick={() => f.setNotificationPrefs({ timezone: deviceTz })}
                className="press min-h-9 shrink-0 rounded-full px-2.5 text-xs font-medium text-primary hover:bg-primary-soft"
              >
                Use {deviceTz}
              </button>
            )}
          </div>
          <select
            aria-label="Timezone preference"
            value={p.timezone}
            onChange={(e) => f.setNotificationPrefs({ timezone: e.target.value })}
            className="mt-3 min-h-11 w-full rounded-xl border border-border bg-secondary/50 px-3 text-sm font-medium"
          >
            {timezoneChoices.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </div>
      </Card>

      {/* Preview & Test */}
      <p className="mt-6 mb-2 px-1 text-xs font-medium text-muted-foreground">Preview &amp; test</p>
      <Card>
        <div
          className="flex flex-wrap gap-1.5"
          role="tablist"
          aria-label="Notification category previews"
        >
          {PREVIEW_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={previewCategory === tab.id}
              onClick={() => setPreviewCategory(tab.id)}
              className={cn(
                "press min-h-9 rounded-full px-3 text-xs font-semibold transition-colors",
                previewCategory === tab.id
                  ? "bg-ink text-ink-foreground"
                  : "bg-secondary text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <NotificationPreviewCard category={previewCategory} className="mt-4" />

        <div className="mt-4 flex flex-col gap-2">
          <PillButton
            variant="outline"
            disabled={testing || perm !== "granted"}
            onClick={() => void handleTest()}
          >
            <span className="inline-flex items-center gap-2">
              <Send className="size-4" />
              {testing ? "Sending test…" : "Send test notification"}
            </span>
          </PillButton>
          {perm !== "granted" && (
            <p className="text-center text-xs text-muted-foreground">
              {perm === "denied"
                ? "Allow notifications in your browser site settings first to send a test alert."
                : perm === "unsupported"
                  ? "System notifications are unsupported in this browser."
                  : "Tap Enable Focus Notifications above first to send a test alert."}
            </p>
          )}
          {testResult && <p className="text-center text-xs text-muted-foreground">{testResult}</p>}
          <p className="flex items-center justify-center gap-1.5 pt-1 text-[11px] text-muted-foreground">
            <ShieldCheck className="size-3.5 text-primary" />
            <span>Anonymous push registration · never restarts sessions automatically</span>
          </p>
        </div>
      </Card>

      <NotificationOnboarding open={onboardingOpen} onClose={() => setOnboardingOpen(false)} />
    </div>
  );
}
