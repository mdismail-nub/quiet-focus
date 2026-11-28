import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Bell, Check, Image as ImageIcon, Minus, Plus, Volume2, VolumeX, X } from "lucide-react";
import { useFocus } from "@/lib/focus-store";
import { formatClock } from "@/lib/stats";
import type { Ambient } from "@/lib/ambient";
import { clampBackgroundDim } from "@/lib/custom-background-db";
import { useOrientationImmersive } from "@/lib/use-orientation";
import { LandscapeFocus } from "@/components/LandscapeFocus";
import { NotificationOnboarding } from "@/components/NotificationOnboarding";
import { CustomBackgroundControls } from "@/components/CustomBackgroundControls";
import { BottomNav, Header, PillButton, Sheet } from "@/components/ui-kit";
import { TimerRing } from "@/components/TimerRing";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Focus — a quiet focus timer" },
      { name: "description", content: "Pick a duration, start the timer and get to work." },
      { property: "og:title", content: "Focus — a quiet focus timer" },
      { property: "og:description", content: "Pick a duration, start the timer and get to work." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: FocusScreen,
});

const PRESETS = [25, 50, 90];

const AMBIENT_OPTIONS: { id: Ambient; label: string }[] = [
  { id: "off", label: "Off" },
  { id: "rain", label: "Rain" },
  { id: "ocean", label: "Ocean" },
  { id: "fire", label: "Fireplace" },
  { id: "white", label: "White noise" },
];

function FocusScreen() {
  const f = useFocus();
  const { isImmersive, enterImmersive, exitImmersive } = useOrientationImmersive();
  const [customOpen, setCustomOpen] = useState(false);
  const [ambientOpen, setAmbientOpen] = useState(false);
  const [bgOpen, setBgOpen] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const { timer, settings } = f;

  if (isImmersive) {
    return <LandscapeFocus onExit={exitImmersive} />;
  }

  const hasCustomBg = Boolean(settings.customBackgroundEnabled && f.customBackgroundUrl);

  if (timer.status === "completed") {
    return <Completed onImmersive={enterImmersive} />;
  }

  const active = timer.status === "running" || timer.status === "paused";
  const total = Math.max(1, timer.minutes * 60000);
  const progress = active ? Math.min(1, Math.max(0, 1 - f.left / total)) : 0;
  const isCustom = !PRESETS.includes(timer.minutes);
  const ambientLabel = AMBIENT_OPTIONS.find((a) => a.id === settings.ambient)?.label ?? "Off";

  const heading = !active
    ? "Ready to focus?"
    : timer.status === "paused"
      ? "Paused"
      : timer.kind === "break"
        ? "Take a breather"
        : "Stay focused";

  const subheading = active
    ? timer.kind === "break"
      ? `${timer.minutes} minute break`
      : `${timer.minutes} minute session`
    : "Choose a duration and begin.";

  return (
    <div className="screen-in relative mx-auto flex min-h-dvh w-full max-w-md flex-col">
      {hasCustomBg && f.customBackgroundUrl && (
        <div
          aria-hidden="true"
          data-testid="custom-focus-background"
          className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
        >
          <img src={f.customBackgroundUrl} alt="" className="size-full object-cover" />
          <div
            className="absolute inset-0 backdrop-blur-[1px]"
            style={{
              backgroundColor: `rgba(12, 13, 18, ${clampBackgroundDim(settings.customBackgroundDim)})`,
            }}
          />
        </div>
      )}

      <div className={cn("relative z-10 flex flex-1 flex-col", hasCustomBg && "text-white")}>
        <Header onImmersive={enterImmersive} contrastOverBg={hasCustomBg} />

        <div className="mt-2 flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-[26px] font-semibold tracking-tight">{heading}</h1>
            <p
              className={cn(
                "mt-1 text-sm",
                hasCustomBg ? "text-white/80" : "text-muted-foreground",
              )}
            >
              {subheading}
            </p>
          </div>
        </div>

        {/* Optional lightweight session label */}
        <div className="mt-3 min-h-7">
          {!active ? (
            <input
              type="text"
              value={timer.label}
              maxLength={60}
              aria-label="Session focus task"
              placeholder="Add a focus task (optional)"
              onChange={(e) => f.setLabel(e.target.value)}
              className={cn(
                "w-full border-b border-transparent bg-transparent py-1 text-sm focus:outline-hidden",
                hasCustomBg
                  ? "text-white placeholder:text-white/65 focus:border-white/40"
                  : "text-foreground placeholder:text-muted-foreground/70 focus:border-border",
              )}
            />
          ) : timer.label.trim() ? (
            <p
              className={cn(
                "truncate py-1 text-sm font-medium",
                hasCustomBg ? "text-white/90" : "text-foreground/85",
              )}
            >
              {timer.label.trim()}
            </p>
          ) : null}
        </div>

        <div className="flex flex-1 flex-col justify-center py-6">
          <TimerRing
            progress={progress}
            ringFill={hasCustomBg ? "rgba(14, 16, 22, 0.56)" : "var(--color-card)"}
            trackStroke={hasCustomBg ? "rgba(255, 255, 255, 0.24)" : "var(--color-track)"}
          >
            <span className="text-[11px] font-semibold tracking-[0.18em] text-primary">
              {timer.kind === "break" ? "BREAK" : "FOCUS SESSION"}
            </span>
            <span
              className={cn(
                "mt-2 text-6xl font-bold tracking-tight tabular-nums",
                hasCustomBg && "text-white",
              )}
              aria-live="off"
            >
              {f.ready ? formatClock(f.left) : "--:--"}
            </span>
            <span
              className={cn(
                "mt-3 max-w-[180px] truncate text-sm",
                hasCustomBg ? "text-white/75" : "text-muted-foreground",
              )}
            >
              {timer.kind === "break" ? "Step back and rest." : "One thing at a time."}
            </span>
          </TimerRing>
        </div>

        {/* Quiet utility strip: ambient sound, custom background & pomodoro status */}
        <div
          className={cn(
            "mb-3 flex flex-wrap items-center justify-center gap-1.5 text-xs",
            hasCustomBg ? "text-white/80" : "text-muted-foreground",
          )}
        >
          <button
            type="button"
            onClick={() => setAmbientOpen(true)}
            className={cn(
              "press flex min-h-9 items-center gap-1.5 rounded-full px-2.5 py-1 transition-colors",
              hasCustomBg
                ? "bg-black/30 text-white backdrop-blur-md hover:bg-black/45"
                : "hover:bg-secondary hover:text-foreground",
            )}
          >
            {settings.ambient === "off" ? (
              <VolumeX className="size-3.5" strokeWidth={1.75} />
            ) : (
              <Volume2 className="size-3.5 text-primary" strokeWidth={1.75} />
            )}
            <span>Sound: {ambientLabel}</span>
          </button>

          <button
            type="button"
            onClick={() => setBgOpen(true)}
            aria-label="Customize focus background"
            className={cn(
              "press flex min-h-9 items-center gap-1.5 rounded-full px-2.5 py-1 transition-colors",
              hasCustomBg
                ? "bg-black/30 text-white backdrop-blur-md hover:bg-black/45"
                : "hover:bg-secondary hover:text-foreground",
            )}
          >
            <ImageIcon
              className={cn("size-3.5", hasCustomBg && "text-primary")}
              strokeWidth={1.75}
            />
            <span>{hasCustomBg ? "Background: On" : "Background"}</span>
          </button>

          {settings.pomodoro && (
            <span
              className={cn(
                "rounded-full px-2 py-0.5",
                hasCustomBg ? "bg-black/25 text-white/85 backdrop-blur-md" : "",
              )}
            >
              · {settings.breakMinutes}m break
            </span>
          )}
        </div>

        {!active && (
          <div className="mb-5 grid grid-cols-4 gap-2" role="radiogroup" aria-label="Duration">
            {PRESETS.map((m) => (
              <Chip
                key={m}
                selected={timer.minutes === m}
                contrastOverBg={hasCustomBg}
                onClick={() => f.selectMinutes(m)}
              >
                {m} min
              </Chip>
            ))}
            <Chip
              selected={isCustom}
              contrastOverBg={hasCustomBg}
              onClick={() => setCustomOpen(true)}
            >
              {isCustom ? `${timer.minutes} min` : "Custom"}
            </Chip>
          </div>
        )}

        <div className="space-y-1 pb-2">
          {timer.status === "idle" && (
            <PillButton
              onClick={f.start}
              className={hasCustomBg ? "!bg-white !text-neutral-950 hover:!bg-white/90" : ""}
            >
              Start focusing
            </PillButton>
          )}
          {timer.status === "running" && (
            <PillButton
              onClick={f.pause}
              className={hasCustomBg ? "!bg-white !text-neutral-950 hover:!bg-white/90" : ""}
            >
              Pause
            </PillButton>
          )}
          {timer.status === "paused" && (
            <PillButton
              onClick={f.resume}
              className={hasCustomBg ? "!bg-white !text-neutral-950 hover:!bg-white/90" : ""}
            >
              Resume
            </PillButton>
          )}
          {active ? (
            <div className="grid grid-cols-2">
              <PillButton
                variant="ghost"
                onClick={f.reset}
                className={hasCustomBg ? "!text-white/85 hover:!bg-white/10 hover:!text-white" : ""}
              >
                Reset
              </PillButton>
              <PillButton
                variant="ghost"
                onClick={() => {
                  if (timer.kind === "break") {
                    f.end();
                  } else {
                    setConfirmEnd(true);
                  }
                }}
                className={hasCustomBg ? "!text-white/85 hover:!bg-white/10 hover:!text-white" : ""}
              >
                {timer.kind === "break" ? "Skip break" : "End session"}
              </PillButton>
            </div>
          ) : (
            <div className="h-11" />
          )}
        </div>

        {!active && <BottomNav />}
      </div>

      <CustomSheet open={customOpen} onClose={() => setCustomOpen(false)} />
      <AmbientSheet open={ambientOpen} onClose={() => setAmbientOpen(false)} />
      <BackgroundSheet open={bgOpen} onClose={() => setBgOpen(false)} />
      <Sheet
        open={confirmEnd}
        onClose={() => setConfirmEnd(false)}
        ariaLabel="End session confirmation"
      >
        <h2 className="text-xl font-semibold">End this session?</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Your progress on this session won&apos;t be saved.
        </p>
        <div className="mt-6 space-y-2">
          <PillButton
            onClick={() => {
              f.end();
              setConfirmEnd(false);
            }}
          >
            End session
          </PillButton>
          <PillButton variant="ghost" onClick={() => setConfirmEnd(false)}>
            Keep focusing
          </PillButton>
        </div>
      </Sheet>
    </div>
  );
}

function Chip({
  selected,
  contrastOverBg,
  ...p
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  selected: boolean;
  contrastOverBg?: boolean;
}) {
  return (
    <button
      role="radio"
      aria-checked={selected}
      {...p}
      className={cn(
        "press h-11 rounded-full border text-sm font-medium transition-colors",
        contrastOverBg
          ? selected
            ? "border-primary bg-primary text-white shadow-xs"
            : "border-white/25 bg-black/35 text-white/85 backdrop-blur-md hover:bg-black/50"
          : selected
            ? "border-primary bg-primary-soft text-foreground"
            : "border-border bg-card text-muted-foreground",
      )}
    />
  );
}

export function CustomSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const f = useFocus();
  const clamp = (v: number) => Math.min(240, Math.max(1, Math.round(v)));
  const [m, setM] = useState(f.settings.customMinutes);
  const [draft, setDraft] = useState(String(f.settings.customMinutes));

  useEffect(() => {
    if (open) {
      const clamped = clamp(f.settings.customMinutes);
      setM(clamped);
      setDraft(String(clamped));
    }
  }, [open, f.settings.customMinutes]);

  const applyStep = (delta: number) => {
    const next = clamp(m + delta);
    setM(next);
    setDraft(String(next));
  };

  const commitDraft = () => {
    const parsed = Number(draft);
    const next = Number.isFinite(parsed) && draft.trim() !== "" ? clamp(parsed) : m;
    setM(next);
    setDraft(String(next));
    return next;
  };

  return (
    <Sheet open={open} onClose={onClose} ariaLabel="Custom duration">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">Custom duration</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close custom duration"
          className="press flex min-h-10 min-w-10 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="my-8 flex items-center justify-center gap-6">
        <button
          type="button"
          aria-label="Less"
          className="press flex min-h-11 min-w-11 items-center justify-center rounded-full border border-border p-3"
          onClick={() => applyStep(-5)}
        >
          <Minus className="size-5" />
        </button>
        <label className="flex items-baseline gap-1">
          <input
            aria-label="Minutes"
            type="number"
            inputMode="numeric"
            min={1}
            max={240}
            value={draft}
            onChange={(e) => {
              const val = e.target.value;
              setDraft(val);
              if (val.trim() !== "") {
                const parsed = Number(val);
                if (Number.isFinite(parsed) && parsed >= 1) {
                  setM(clamp(parsed));
                }
              }
            }}
            onBlur={commitDraft}
            className="w-24 bg-transparent text-center text-5xl font-bold tabular-nums outline-hidden"
          />
          <span className="text-muted-foreground">min</span>
        </label>
        <button
          type="button"
          aria-label="More"
          className="press flex min-h-11 min-w-11 items-center justify-center rounded-full border border-border p-3"
          onClick={() => applyStep(5)}
        >
          <Plus className="size-5" />
        </button>
      </div>
      <PillButton
        onClick={() => {
          const finalMinutes = commitDraft();
          f.setSettings({ customMinutes: finalMinutes });
          f.selectMinutes(finalMinutes);
          onClose();
        }}
      >
        Set {m} minutes
      </PillButton>
    </Sheet>
  );
}

function AmbientSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const f = useFocus();
  return (
    <Sheet open={open} onClose={onClose} ariaLabel="Ambient sound">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">Ambient sound</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close ambient sound"
          className="press flex min-h-10 min-w-10 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">Plays quietly during focus sessions.</p>
      <div className="mt-5 grid grid-cols-2 gap-2">
        {AMBIENT_OPTIONS.map((opt) => {
          const selected = f.settings.ambient === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => {
                f.setSettings({ ambient: opt.id });
                onClose();
              }}
              className={cn(
                "press min-h-12 rounded-2xl border px-4 text-left text-sm font-medium transition-colors",
                selected
                  ? "border-primary bg-primary-soft text-foreground"
                  : "border-border bg-secondary/50 text-muted-foreground hover:text-foreground",
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}

function BackgroundSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} ariaLabel="Focus timer background">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-semibold">Focus background</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Upload your own photo or artwork to appear behind the timer.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close background settings"
          className="press flex min-h-10 min-w-10 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="mt-5">
        <CustomBackgroundControls compact />
      </div>

      <div className="mt-5">
        <PillButton variant="outline" onClick={onClose}>
          Done
        </PillButton>
      </div>
    </Sheet>
  );
}

function Completed({ onImmersive }: { onImmersive: () => void }) {
  const f = useFocus();
  const { settings, timer, gamification, notificationPrefs, notificationPermission } = f;
  const [onboardingOpen, setOnboardingOpen] = useState(false);

  const hasCustomBg = Boolean(settings.customBackgroundEnabled && f.customBackgroundUrl);
  const showBreakOffer = settings.pomodoro || notificationPrefs.breakReminders;
  const showOnboardingCard =
    !notificationPrefs.enabled &&
    !notificationPrefs.onboardingCompleted &&
    !notificationPrefs.onboardingDismissed &&
    notificationPermission === "default";

  return (
    <div className="screen-in relative mx-auto flex min-h-dvh w-full max-w-md flex-col">
      {hasCustomBg && f.customBackgroundUrl && (
        <div
          aria-hidden="true"
          data-testid="custom-focus-background"
          className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
        >
          <img src={f.customBackgroundUrl} alt="" className="size-full object-cover" />
          <div
            className="absolute inset-0 backdrop-blur-[1px]"
            style={{
              backgroundColor: `rgba(12, 13, 18, ${clampBackgroundDim(settings.customBackgroundDim)})`,
            }}
          />
        </div>
      )}

      <div className={cn("relative z-10 flex flex-1 flex-col", hasCustomBg && "text-white")}>
        <Header onImmersive={onImmersive} contrastOverBg={hasCustomBg} />
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <div className="relative flex size-28 items-center justify-center">
            <span className="done-pulse absolute inset-0 rounded-full bg-primary-soft" />
            <span className="done-pop relative flex size-20 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Check className="size-9" strokeWidth={2.5} />
            </span>
          </div>
          <h1 className="mt-8 text-[32px] font-bold tracking-tight">Session completed!</h1>
          <p
            className={cn("mt-2 max-w-xs", hasCustomBg ? "text-white/80" : "text-muted-foreground")}
          >
            Great work. You made time for what matters.
          </p>
          <p
            className={cn("mt-6 text-sm", hasCustomBg ? "text-white/80" : "text-muted-foreground")}
          >
            Focused for{" "}
            <span className={cn("font-semibold", hasCustomBg ? "text-white" : "text-foreground")}>
              {timer.minutes} min
            </span>
            {timer.label.trim() ? (
              <>
                <span aria-hidden="true"> · </span>
                <span className={hasCustomBg ? "text-white" : "text-foreground"}>
                  {timer.label.trim()}
                </span>
              </>
            ) : null}
          </p>
          <p className="mt-2 rounded-full bg-primary-soft px-3.5 py-1 text-xs font-semibold text-primary">
            +{timer.minutes} XP · Level {gamification.levelInfo.level}{" "}
            {gamification.levelInfo.title}
          </p>

          {showOnboardingCard && (
            <div className="mt-6 w-full rounded-[22px] border border-border bg-card p-4 text-left text-foreground">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <Bell className="mt-0.5 size-4 shrink-0 text-primary" />
                  <div>
                    <p className="text-sm font-semibold">Want gentle focus reminders?</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Get break nudges and warm daily check-ins on your schedule.
                    </p>
                  </div>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setOnboardingOpen(true)}
                  className="press min-h-9 rounded-full bg-primary px-3.5 text-xs font-semibold text-primary-foreground"
                >
                  Set up reminders
                </button>
                <button
                  type="button"
                  onClick={() => f.setNotificationPrefs({ onboardingDismissed: true })}
                  className="press min-h-9 rounded-full px-3 text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  No thanks
                </button>
              </div>
            </div>
          )}
        </div>
        <div className="space-y-1.5 pb-6">
          {showBreakOffer && (
            <PillButton
              onClick={f.startBreak}
              className={hasCustomBg ? "!bg-white !text-neutral-950 hover:!bg-white/90" : ""}
            >
              Start {settings.breakMinutes} min break
            </PillButton>
          )}
          <PillButton
            variant={showBreakOffer ? "outline" : "primary"}
            onClick={() => {
              f.dismiss();
              f.start();
            }}
            className={
              hasCustomBg && !showBreakOffer ? "!bg-white !text-neutral-950 hover:!bg-white/90" : ""
            }
          >
            Start another session
          </PillButton>
          <PillButton
            variant="ghost"
            onClick={f.dismiss}
            className={hasCustomBg ? "!text-white/85 hover:!bg-white/10 hover:!text-white" : ""}
          >
            Back to home
          </PillButton>
        </div>
      </div>
      <NotificationOnboarding open={onboardingOpen} onClose={() => setOnboardingOpen(false)} />
    </div>
  );
}
