import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Check, Minus, Plus, Volume2, VolumeX } from "lucide-react";
import { useFocus } from "@/lib/focus-store";
import { formatClock } from "@/lib/stats";
import type { Ambient } from "@/lib/ambient";
import { useOrientationImmersive } from "@/lib/use-orientation";
import { LandscapeFocus } from "@/components/LandscapeFocus";
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
  const [confirmEnd, setConfirmEnd] = useState(false);
  const { timer, settings } = f;

  if (isImmersive) {
    return <LandscapeFocus onExit={exitImmersive} />;
  }

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
    <div className="screen-in flex min-h-dvh flex-col">
      <Header onImmersive={enterImmersive} />

      <div className="mt-2 flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-[26px] font-semibold tracking-tight">{heading}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{subheading}</p>
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
            className="w-full border-b border-transparent bg-transparent py-1 text-sm text-foreground placeholder:text-muted-foreground/70 focus:border-border focus:outline-hidden"
          />
        ) : timer.label.trim() ? (
          <p className="truncate py-1 text-sm font-medium text-foreground/85">
            {timer.label.trim()}
          </p>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col justify-center py-6">
        <TimerRing progress={progress}>
          <span className="text-[11px] font-semibold tracking-[0.18em] text-primary">
            {timer.kind === "break" ? "BREAK" : "FOCUS SESSION"}
          </span>
          <span className="mt-2 text-6xl font-bold tracking-tight tabular-nums" aria-live="off">
            {f.ready ? formatClock(f.left) : "--:--"}
          </span>
          <span className="mt-3 max-w-[180px] truncate text-sm text-muted-foreground">
            {timer.kind === "break" ? "Step back and rest." : "One thing at a time."}
          </span>
        </TimerRing>
      </div>

      {/* Quiet utility strip: ambient sound & pomodoro status */}
      <div className="mb-3 flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <button
          type="button"
          onClick={() => setAmbientOpen(true)}
          className="press flex min-h-9 items-center gap-1.5 rounded-full px-2.5 py-1 transition-colors hover:bg-secondary hover:text-foreground"
        >
          {settings.ambient === "off" ? (
            <VolumeX className="size-3.5" strokeWidth={1.75} />
          ) : (
            <Volume2 className="size-3.5 text-primary" strokeWidth={1.75} />
          )}
          <span>Sound: {ambientLabel}</span>
        </button>
        {settings.pomodoro && (
          <>
            <span aria-hidden="true">·</span>
            <span>Pomodoro {settings.breakMinutes}m break</span>
          </>
        )}
      </div>

      {!active && (
        <div className="mb-5 grid grid-cols-4 gap-2" role="radiogroup" aria-label="Duration">
          {PRESETS.map((m) => (
            <Chip key={m} selected={timer.minutes === m} onClick={() => f.selectMinutes(m)}>
              {m} min
            </Chip>
          ))}
          <Chip selected={isCustom} onClick={() => setCustomOpen(true)}>
            {isCustom ? `${timer.minutes} min` : "Custom"}
          </Chip>
        </div>
      )}

      <div className="space-y-1 pb-2">
        {timer.status === "idle" && <PillButton onClick={f.start}>Start focusing</PillButton>}
        {timer.status === "running" && <PillButton onClick={f.pause}>Pause</PillButton>}
        {timer.status === "paused" && <PillButton onClick={f.resume}>Resume</PillButton>}
        {active ? (
          <div className="grid grid-cols-2">
            <PillButton variant="ghost" onClick={f.reset}>
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
            >
              {timer.kind === "break" ? "Skip break" : "End session"}
            </PillButton>
          </div>
        ) : (
          <div className="h-11" />
        )}
      </div>

      {!active && <BottomNav />}

      <CustomSheet open={customOpen} onClose={() => setCustomOpen(false)} />
      <AmbientSheet open={ambientOpen} onClose={() => setAmbientOpen(false)} />
      <Sheet open={confirmEnd} onClose={() => setConfirmEnd(false)}>
        <h2 className="text-xl font-semibold">End this session?</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Your progress on this session won't be saved.
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
  ...p
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { selected: boolean }) {
  return (
    <button
      role="radio"
      aria-checked={selected}
      {...p}
      className={cn(
        "press h-11 rounded-full border text-sm font-medium transition-colors",
        selected
          ? "border-primary bg-primary-soft text-foreground"
          : "border-border bg-card text-muted-foreground",
      )}
    />
  );
}

export function CustomSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const f = useFocus();
  const [m, setM] = useState(f.settings.customMinutes);
  const clamp = (v: number) => Math.min(240, Math.max(1, v));
  return (
    <Sheet open={open} onClose={onClose}>
      <h2 className="text-xl font-semibold">Custom duration</h2>
      <div className="my-8 flex items-center justify-center gap-6">
        <button
          aria-label="Less"
          className="press flex min-h-11 min-w-11 items-center justify-center rounded-full border border-border p-3"
          onClick={() => setM((v) => clamp(v - 5))}
        >
          <Minus className="size-5" />
        </button>
        <label className="flex items-baseline gap-1">
          <input
            aria-label="Minutes"
            type="number"
            inputMode="numeric"
            value={m}
            onChange={(e) => setM(clamp(Number(e.target.value) || 1))}
            className="w-24 bg-transparent text-center text-5xl font-bold tabular-nums outline-hidden"
          />
          <span className="text-muted-foreground">min</span>
        </label>
        <button
          aria-label="More"
          className="press flex min-h-11 min-w-11 items-center justify-center rounded-full border border-border p-3"
          onClick={() => setM((v) => clamp(v + 5))}
        >
          <Plus className="size-5" />
        </button>
      </div>
      <PillButton
        onClick={() => {
          f.setSettings({ customMinutes: m });
          f.selectMinutes(m);
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
    <Sheet open={open} onClose={onClose}>
      <h2 className="text-xl font-semibold">Ambient sound</h2>
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

function Completed({ onImmersive }: { onImmersive: () => void }) {
  const f = useFocus();
  const { settings, timer } = f;
  return (
    <div className="screen-in flex min-h-dvh flex-col">
      <Header onImmersive={onImmersive} />
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <div className="relative flex size-28 items-center justify-center">
          <span className="done-pulse absolute inset-0 rounded-full bg-primary-soft" />
          <span className="done-pop relative flex size-20 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Check className="size-9" strokeWidth={2.5} />
          </span>
        </div>
        <h1 className="mt-8 text-[32px] font-bold tracking-tight">Session completed!</h1>
        <p className="mt-2 max-w-xs text-muted-foreground">
          Great work. You made time for what matters.
        </p>
        <p className="mt-6 text-sm text-muted-foreground">
          Focused for <span className="font-semibold text-foreground">{timer.minutes} min</span>
          {timer.label.trim() ? (
            <>
              <span aria-hidden="true"> · </span>
              <span className="text-foreground">{timer.label.trim()}</span>
            </>
          ) : null}
        </p>
      </div>
      <div className="space-y-1.5 pb-6">
        {settings.pomodoro && (
          <PillButton onClick={f.startBreak}>Start {settings.breakMinutes} min break</PillButton>
        )}
        <PillButton
          variant={settings.pomodoro ? "outline" : "primary"}
          onClick={() => {
            f.dismiss();
            f.start();
          }}
        >
          Start another session
        </PillButton>
        <PillButton variant="ghost" onClick={f.dismiss}>
          Back to home
        </PillButton>
      </div>
    </div>
  );
}
