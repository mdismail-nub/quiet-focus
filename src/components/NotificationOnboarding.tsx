import { useEffect, useState } from "react";
import { Bell, Check, ChevronLeft, Clock, Sparkles, WifiOff } from "lucide-react";
import { useFocus } from "@/lib/focus-store";
import { SUGGESTED_REMINDER_TIMES, formatHHMM12Hour } from "@/lib/notifications-core";
import { NotificationMascot, NotificationPreviewCard } from "@/components/NotificationMascot";
import { PillButton, Sheet } from "@/components/ui-kit";
import { cn } from "@/lib/utils";

type Step = 1 | 2 | 3 | 4 | 5;

export function NotificationOnboarding({ open, onClose }: { open: boolean; onClose: () => void }) {
  const f = useFocus();
  const [step, setStep] = useState<Step>(1);
  const [dailyCount, setDailyCount] = useState<1 | 2 | 3>(f.notificationPrefs.dailyCount);
  const [sessionCompletion, setSessionCompletion] = useState(f.notificationPrefs.sessionCompletion);
  const [breakReminders, setBreakReminders] = useState(f.notificationPrefs.breakReminders);
  const [morningTime, setMorningTime] = useState(
    f.notificationPrefs.morningTime || SUGGESTED_REMINDER_TIMES.morning,
  );
  const [afternoonTime, setAfternoonTime] = useState(
    f.notificationPrefs.afternoonTime || SUGGESTED_REMINDER_TIMES.afternoon,
  );
  const [eveningTime, setEveningTime] = useState(
    f.notificationPrefs.eveningTime || SUGGESTED_REMINDER_TIMES.evening,
  );
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setStep(1);
      setDailyCount(f.notificationPrefs.dailyCount);
      setSessionCompletion(f.notificationPrefs.sessionCompletion);
      setBreakReminders(f.notificationPrefs.breakReminders);
      setMorningTime(f.notificationPrefs.morningTime);
      setAfternoonTime(f.notificationPrefs.afternoonTime);
      setEveningTime(f.notificationPrefs.eveningTime);
      setFeedback(null);
      setSubmitting(false);
    }
  }, [
    open,
    f.notificationPrefs.dailyCount,
    f.notificationPrefs.sessionCompletion,
    f.notificationPrefs.breakReminders,
    f.notificationPrefs.morningTime,
    f.notificationPrefs.afternoonTime,
    f.notificationPrefs.eveningTime,
  ]);

  const handleSkip = () => {
    f.setNotificationPrefs({ onboardingDismissed: true });
    onClose();
  };

  const handleEnable = async () => {
    setSubmitting(true);
    setFeedback(null);
    const res = await f.enableCompanionNotifications({
      dailyCount,
      sessionCompletion,
      breakReminders,
      dailyMotivation: true,
      morningTime,
      afternoonTime,
      eveningTime,
      customTimes: [],
      onboardingCompleted: true,
      onboardingDismissed: false,
    });
    setSubmitting(false);

    if (res.ok) {
      onClose();
      return;
    }

    if (res.permission === "denied") {
      setFeedback(
        "Notifications are blocked by your browser. You can allow them anytime in browser site settings.",
      );
      return;
    }

    if (res.permission === "unsupported") {
      setFeedback("System notifications are not supported in this browser environment.");
      return;
    }

    setFeedback(res.error ?? "Permission was dismissed. You can enable notifications anytime.");
  };

  const permissionDenied = f.notificationPermission === "denied";
  const unsupported = !f.notificationSupport.notificationApi;
  const offlineNow = !f.serverOnline || (typeof navigator !== "undefined" && !navigator.onLine);

  return (
    <Sheet open={open} onClose={handleSkip}>
      <div className="flex items-center justify-between gap-2">
        {step > 1 ? (
          <button
            type="button"
            onClick={() => setStep((s) => (s > 1 ? ((s - 1) as Step) : 1))}
            className="press -ml-2 flex min-h-11 items-center gap-1 rounded-full px-2 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="size-4" />
            Back
          </button>
        ) : (
          <span className="text-xs font-medium text-muted-foreground">Optional setup</span>
        )}
        <div className="flex items-center gap-1.5" aria-label={`Step ${step} of 5`}>
          {([1, 2, 3, 4, 5] as Step[]).map((n) => (
            <span
              key={n}
              className={cn(
                "h-1.5 rounded-full transition-all",
                n === step ? "w-5 bg-primary" : n < step ? "w-2 bg-primary/50" : "w-2 bg-track",
              )}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={handleSkip}
          className="press -mr-2 min-h-11 rounded-full px-2 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          Skip for now
        </button>
      </div>

      {step === 1 && (
        <div className="mt-4">
          <div className="flex items-center gap-3.5">
            <NotificationMascot category="motivation" size="lg" />
            <div>
              <h2 className="text-xl font-semibold tracking-tight">Meet your Focus Companion</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Gentle nudges, never guilt. Stay consistent on your own schedule.
              </p>
            </div>
          </div>

          <div className="mt-5 space-y-2.5 text-sm">
            <div className="flex items-start gap-3 rounded-2xl bg-secondary/60 p-3.5">
              <Bell className="mt-0.5 size-4 shrink-0 text-primary" />
              <div>
                <p className="font-medium">Session &amp; break pings</p>
                <p className="text-xs text-muted-foreground">
                  Know when a focus block or break finishes, even in another tab.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-2xl bg-secondary/60 p-3.5">
              <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
              <div>
                <p className="font-medium">Warm daily encouragement</p>
                <p className="text-xs text-muted-foreground">
                  Up to 3 short, playful reminders respecting your quiet hours.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-6 space-y-1.5">
            <PillButton onClick={() => setStep(2)}>Customize reminders</PillButton>
            <PillButton variant="ghost" onClick={handleSkip}>
              Maybe later
            </PillButton>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="mt-4">
          <h2 className="text-xl font-semibold tracking-tight">How often should we check in?</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Pick your daily encouragement rhythm. You can change this anytime.
          </p>

          <div
            className="mt-5 grid grid-cols-3 gap-2"
            role="radiogroup"
            aria-label="Daily reminder count"
          >
            {([1, 2, 3] as const).map((count) => {
              const selected = dailyCount === count;
              const desc = count === 1 ? "Morning" : count === 2 ? "AM + Evening" : "AM, Mid, PM";
              return (
                <button
                  key={count}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setDailyCount(count)}
                  className={cn(
                    "press flex min-h-20 flex-col items-center justify-center rounded-2xl border p-3 text-center transition-colors",
                    selected
                      ? "border-primary bg-primary-soft text-foreground"
                      : "border-border bg-secondary/40 text-muted-foreground hover:text-foreground",
                  )}
                >
                  <span className="text-xl font-bold tabular-nums">{count}</span>
                  <span className="mt-0.5 text-[11px] font-medium">{desc}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-4 space-y-2">
            <label className="flex min-h-12 cursor-pointer items-center justify-between rounded-2xl border border-border px-4 py-2.5 text-sm">
              <span>Notify when a session finishes</span>
              <input
                type="checkbox"
                checked={sessionCompletion}
                onChange={(e) => setSessionCompletion(e.target.checked)}
                className="size-4 accent-primary"
              />
            </label>
            <label className="flex min-h-12 cursor-pointer items-center justify-between rounded-2xl border border-border px-4 py-2.5 text-sm">
              <span>Notify when a break ends</span>
              <input
                type="checkbox"
                checked={breakReminders}
                onChange={(e) => setBreakReminders(e.target.checked)}
                className="size-4 accent-primary"
              />
            </label>
          </div>

          <div className="mt-6">
            <PillButton onClick={() => setStep(3)}>Next: choose times</PillButton>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="mt-4">
          <h2 className="text-xl font-semibold tracking-tight">Preferred reminder windows</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Scheduled in{" "}
            <span className="font-medium text-foreground">{f.notificationPrefs.timezone}</span>.
          </p>

          <div className="mt-5 space-y-3">
            <label className="flex min-h-13 items-center justify-between rounded-2xl border border-border px-4 py-2.5">
              <span className="flex items-center gap-2 text-sm font-medium">
                <Clock className="size-4 text-primary" />
                Morning
              </span>
              <input
                type="time"
                aria-label="Morning reminder time"
                value={morningTime}
                onChange={(e) => setMorningTime(e.target.value)}
                className="rounded-lg bg-secondary px-2.5 py-1.5 text-sm font-medium tabular-nums"
              />
            </label>

            {dailyCount === 3 && (
              <label className="flex min-h-13 items-center justify-between rounded-2xl border border-border px-4 py-2.5">
                <span className="flex items-center gap-2 text-sm font-medium">
                  <Clock className="size-4 text-primary" />
                  Afternoon
                </span>
                <input
                  type="time"
                  aria-label="Afternoon reminder time"
                  value={afternoonTime}
                  onChange={(e) => setAfternoonTime(e.target.value)}
                  className="rounded-lg bg-secondary px-2.5 py-1.5 text-sm font-medium tabular-nums"
                />
              </label>
            )}

            {dailyCount >= 2 && (
              <label className="flex min-h-13 items-center justify-between rounded-2xl border border-border px-4 py-2.5">
                <span className="flex items-center gap-2 text-sm font-medium">
                  <Clock className="size-4 text-primary" />
                  Evening
                </span>
                <input
                  type="time"
                  aria-label="Evening reminder time"
                  value={eveningTime}
                  onChange={(e) => setEveningTime(e.target.value)}
                  className="rounded-lg bg-secondary px-2.5 py-1.5 text-sm font-medium tabular-nums"
                />
              </label>
            )}
          </div>

          <p className="mt-3 text-xs text-muted-foreground">
            Quiet hours default to {formatHHMM12Hour(f.notificationPrefs.quietStart)} –{" "}
            {formatHHMM12Hour(f.notificationPrefs.quietEnd)}.
          </p>

          <div className="mt-6">
            <PillButton onClick={() => setStep(4)}>Preview notification</PillButton>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="mt-4">
          <h2 className="text-xl font-semibold tracking-tight">Here is how it looks</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Short, friendly updates tailored to focus, breaks, and daily starts.
          </p>

          <NotificationPreviewCard category="motivation" className="mt-5" />
          <NotificationPreviewCard category="completion" className="mt-3" />

          <div className="mt-6">
            <PillButton onClick={() => setStep(5)}>Continue</PillButton>
          </div>
        </div>
      )}

      {step === 5 && (
        <div className="mt-4">
          <div className="flex items-center gap-3.5">
            <NotificationMascot category="completion" size="lg" />
            <div>
              <h2 className="text-xl font-semibold tracking-tight">Turn on notifications?</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Your browser will ask once to allow notifications from Focus.
              </p>
            </div>
          </div>

          {offlineNow && (
            <div className="mt-4 flex items-start gap-2.5 rounded-2xl border border-primary/30 bg-primary-soft p-3 text-xs">
              <WifiOff className="mt-0.5 size-4 shrink-0 text-primary" />
              <span>
                You appear offline. Preferences will be saved locally and background push scheduling
                will sync automatically when you reconnect.
              </span>
            </div>
          )}

          {f.notificationSupport.iosNeedsHomeScreen && (
            <div className="mt-4 rounded-2xl border border-border bg-secondary/60 p-3 text-xs text-muted-foreground">
              On iPhone/iPad, add Focus to your Home Screen first (Share → Add to Home Screen) so
              system push notifications are available.
            </div>
          )}

          {feedback && (
            <p className="mt-4 rounded-2xl bg-coral/12 p-3 text-xs font-medium text-foreground">
              {feedback}
            </p>
          )}

          <div className="mt-6 space-y-2">
            {permissionDenied ? (
              <div className="rounded-2xl border border-border bg-secondary/50 p-3.5 text-xs text-muted-foreground">
                Permission is currently{" "}
                <span className="font-semibold text-foreground">Denied</span>. Enable notifications
                for this site in your browser settings, then return here.
              </div>
            ) : unsupported ? (
              <div className="rounded-2xl border border-border bg-secondary/50 p-3.5 text-xs text-muted-foreground">
                System notifications are unsupported in this browser.
              </div>
            ) : (
              <PillButton onClick={() => void handleEnable()} disabled={submitting}>
                <span className="inline-flex items-center gap-2">
                  <Check className="size-4" />
                  {submitting ? "Enabling…" : "Enable Focus Notifications"}
                </span>
              </PillButton>
            )}
            <PillButton variant="ghost" onClick={handleSkip}>
              Not right now
            </PillButton>
          </div>
        </div>
      )}
    </Sheet>
  );
}
