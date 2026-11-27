import { useEffect, useRef, useState } from "react";
import {
  Check,
  Maximize,
  Minimize,
  Pause,
  Play,
  RotateCcw,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { useFocus } from "@/lib/focus-store";
import { formatClock } from "@/lib/stats";
import type { Ambient } from "@/lib/ambient";
import {
  isFullscreenActive,
  isFullscreenSupported,
  onFullscreenChange,
  toggleFullscreen,
} from "@/lib/fullscreen";
import { cn } from "@/lib/utils";

const PRESETS = [25, 50, 90];

const AMBIENT_OPTIONS: { id: Ambient; label: string }[] = [
  { id: "off", label: "Off" },
  { id: "rain", label: "Rain" },
  { id: "ocean", label: "Ocean" },
  { id: "fire", label: "Fireplace" },
  { id: "white", label: "White noise" },
];

export function LandscapeFocus({ onExit }: { onExit: () => void }) {
  const f = useFocus();
  const { timer, settings } = f;
  const [fsSupported, setFsSupported] = useState(false);
  const [fsActive, setFsActive] = useState(false);
  const [chromeActive, setChromeActive] = useState(true);
  const [ambientOpen, setAmbientOpen] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const active = timer.status === "running" || timer.status === "paused";
  const isRunning = timer.status === "running";
  const total = Math.max(1, timer.minutes * 60000);
  const progress = active
    ? Math.min(1, Math.max(0, 1 - f.left / total))
    : timer.status === "completed"
      ? 1
      : 0;

  useEffect(() => {
    setFsSupported(isFullscreenSupported());
    setFsActive(isFullscreenActive());
    return onFullscreenChange((val) => setFsActive(val));
  }, []);

  useEffect(() => {
    if (!isRunning || ambientOpen || confirmEnd) {
      setChromeActive(true);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      return;
    }

    const wakeChrome = () => {
      setChromeActive(true);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => setChromeActive(false), 3500);
    };

    wakeChrome();
    window.addEventListener("pointermove", wakeChrome, { passive: true });
    window.addEventListener("touchstart", wakeChrome, { passive: true });
    window.addEventListener("keydown", wakeChrome);

    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      window.removeEventListener("pointermove", wakeChrome);
      window.removeEventListener("touchstart", wakeChrome);
      window.removeEventListener("keydown", wakeChrome);
    };
  }, [isRunning, ambientOpen, confirmEnd]);

  const themeClass = `landscape-${settings.landscapeTheme}`;
  const chromeOpacity =
    isRunning && !chromeActive
      ? "opacity-45 hover:opacity-100 focus-within:opacity-100"
      : "opacity-100";

  const taskText = timer.label.trim() || (timer.kind === "break" ? "Break" : "Focus session");
  const statusDetail =
    timer.status === "paused"
      ? "Paused"
      : timer.kind === "break"
        ? `${timer.minutes} min break`
        : `${timer.minutes} min`;

  const ambientLabel = AMBIENT_OPTIONS.find((a) => a.id === settings.ambient)?.label ?? "Off";

  return (
    <div
      className={cn(
        "landscape-in landscape-stage fixed inset-0 z-40 flex h-dvh w-screen flex-col justify-between overflow-hidden select-none",
        "pl-[max(1.5rem,env(safe-area-inset-left))] pr-[max(1.5rem,env(safe-area-inset-right))]",
        "pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))]",
        "sm:px-10 sm:py-7",
        themeClass,
      )}
      onPointerDown={() => setChromeActive(true)}
    >
      {/* Top discreet bar */}
      <header
        className={cn(
          "motion-safe-transition relative z-10 flex items-center justify-between gap-4 transition-opacity duration-500",
          chromeOpacity,
        )}
      >
        <div className="flex min-w-0 items-center gap-2 text-xs sm:text-sm">
          <span className="truncate font-medium text-[var(--lf-fg)]">{taskText}</span>
          <span aria-hidden="true" className="text-[var(--lf-muted)]">
            ·
          </span>
          <span className="shrink-0 whitespace-nowrap text-[var(--lf-muted)]">{statusDetail}</span>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => setAmbientOpen((v) => !v)}
            aria-label={`Ambient sound: ${ambientLabel}`}
            className="press flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-full px-3 text-xs font-medium text-[var(--lf-muted)] transition-colors hover:bg-[var(--lf-surface)] hover:text-[var(--lf-fg)]"
          >
            {settings.ambient === "off" ? (
              <VolumeX className="size-4" strokeWidth={1.75} />
            ) : (
              <Volume2 className="size-4 text-[var(--lf-accent)]" strokeWidth={1.75} />
            )}
            <span className="hidden whitespace-nowrap sm:inline">{ambientLabel}</span>
          </button>

          {fsSupported && (
            <button
              type="button"
              onClick={() => void toggleFullscreen()}
              aria-label={fsActive ? "Exit full screen" : "Enter full screen"}
              className="press flex min-h-11 min-w-11 items-center justify-center rounded-full text-[var(--lf-muted)] transition-colors hover:bg-[var(--lf-surface)] hover:text-[var(--lf-fg)]"
            >
              {fsActive ? (
                <Minimize className="size-4" strokeWidth={1.75} />
              ) : (
                <Maximize className="size-4" strokeWidth={1.75} />
              )}
            </button>
          )}

          <button
            type="button"
            onClick={onExit}
            aria-label="Exit landscape mode"
            className="press flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-full px-3 text-xs font-medium text-[var(--lf-muted)] transition-colors hover:bg-[var(--lf-surface)] hover:text-[var(--lf-fg)]"
          >
            <X className="size-4" strokeWidth={1.75} />
            <span className="hidden whitespace-nowrap sm:inline">Exit</span>
          </button>
        </div>
      </header>

      {/* Center focal stage */}
      <main className="relative z-0 flex flex-1 flex-col items-center justify-center px-4 text-center">
        {timer.status === "completed" ? (
          <div className="flex flex-col items-center">
            <div className="relative flex size-20 items-center justify-center sm:size-24">
              <span className="done-pulse absolute inset-0 rounded-full bg-[var(--lf-surface-strong)]" />
              <span className="done-pop relative flex size-16 items-center justify-center rounded-full bg-[var(--lf-accent)] text-[var(--lf-pill-fg)] sm:size-20">
                <Check className="size-8" strokeWidth={2.5} />
              </span>
            </div>
            <h1 className="mt-5 text-2xl font-bold tracking-tight text-balance sm:text-4xl">
              Session completed!
            </h1>
            <p className="mt-2 text-sm text-[var(--lf-muted)] sm:text-base">
              Focused for {timer.minutes} min
              {timer.label.trim() ? ` · ${timer.label.trim()}` : ""}
            </p>
          </div>
        ) : (
          <div className="flex w-full flex-col items-center">
            <span className="mb-2 text-[11px] font-semibold tracking-[0.2em] uppercase text-[var(--lf-muted)] sm:mb-3 sm:text-xs">
              {timer.kind === "break" ? "Break" : timer.status === "paused" ? "Paused" : "Focus"}
            </span>

            <div
              className="text-[clamp(3.75rem,min(20vw,34dvh),11rem)] leading-none font-bold tracking-[-0.04em] text-[var(--lf-fg)] tabular-nums"
              aria-live="off"
            >
              {f.ready ? formatClock(f.left) : "--:--"}
            </div>

            {/* Subtle horizon progress indicator */}
            <div
              role="progressbar"
              aria-label="Session progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress * 100)}
              className="mt-4 h-[3px] w-full max-w-[min(26rem,62vw)] overflow-hidden rounded-full bg-[var(--lf-track)] sm:mt-6"
            >
              <div
                className="motion-safe-transition h-full w-full origin-left rounded-full bg-[var(--lf-accent)] transition-transform duration-300 ease-linear"
                style={{ transform: `scaleX(${progress})` }}
              />
            </div>
          </div>
        )}
      </main>

      {/* Bottom discreet controls */}
      <footer
        className={cn(
          "motion-safe-transition relative z-10 flex min-h-12 items-center justify-center transition-opacity duration-500",
          chromeOpacity,
        )}
      >
        {timer.status === "completed" ? (
          <div className="flex flex-wrap items-center justify-center gap-3">
            {settings.pomodoro && (
              <button
                type="button"
                onClick={f.startBreak}
                className="press min-h-11 rounded-full bg-[var(--lf-pill-bg)] px-6 text-sm font-semibold whitespace-nowrap text-[var(--lf-pill-fg)]"
              >
                Start {settings.breakMinutes} min break
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                f.dismiss();
                f.start();
              }}
              className={cn(
                "press min-h-11 rounded-full px-6 text-sm font-semibold whitespace-nowrap",
                settings.pomodoro
                  ? "bg-[var(--lf-surface)] text-[var(--lf-fg)] hover:bg-[var(--lf-surface-strong)]"
                  : "bg-[var(--lf-pill-bg)] text-[var(--lf-pill-fg)]",
              )}
            >
              Start another
            </button>
            <button
              type="button"
              onClick={() => {
                f.dismiss();
                onExit();
              }}
              className="press min-h-11 rounded-full px-5 text-sm font-medium whitespace-nowrap text-[var(--lf-muted)] hover:text-[var(--lf-fg)]"
            >
              Exit
            </button>
          </div>
        ) : timer.status === "idle" ? (
          <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-5">
            <div
              className="flex items-center gap-1 rounded-full bg-[var(--lf-surface)] p-1"
              role="radiogroup"
              aria-label="Duration"
            >
              {PRESETS.map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={timer.minutes === m}
                  onClick={() => f.selectMinutes(m)}
                  className={cn(
                    "press min-h-9 rounded-full px-3.5 text-xs font-medium whitespace-nowrap transition-colors sm:text-sm",
                    timer.minutes === m
                      ? "bg-[var(--lf-pill-bg)] text-[var(--lf-pill-fg)]"
                      : "text-[var(--lf-muted)] hover:text-[var(--lf-fg)]",
                  )}
                >
                  {m}m
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={f.start}
              className="press flex min-h-11 items-center gap-2 rounded-full bg-[var(--lf-pill-bg)] px-6 text-sm font-semibold whitespace-nowrap text-[var(--lf-pill-fg)]"
            >
              <Play className="size-4 fill-current" />
              Start
            </button>
          </div>
        ) : confirmEnd ? (
          <div className="flex items-center gap-3">
            <span className="text-xs text-[var(--lf-muted)] sm:text-sm">
              End session without saving?
            </span>
            <button
              type="button"
              onClick={() => {
                f.end();
                setConfirmEnd(false);
              }}
              className="press min-h-11 rounded-full bg-[var(--lf-pill-bg)] px-5 text-xs font-semibold whitespace-nowrap text-[var(--lf-pill-fg)] sm:text-sm"
            >
              End session
            </button>
            <button
              type="button"
              onClick={() => setConfirmEnd(false)}
              className="press min-h-11 rounded-full px-4 text-xs font-medium whitespace-nowrap text-[var(--lf-muted)] hover:text-[var(--lf-fg)] sm:text-sm"
            >
              Keep going
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 sm:gap-3">
            {isRunning ? (
              <button
                type="button"
                onClick={f.pause}
                className="press flex min-h-11 items-center gap-2 rounded-full bg-[var(--lf-surface)] px-5 text-sm font-medium whitespace-nowrap text-[var(--lf-fg)] transition-colors hover:bg-[var(--lf-surface-strong)]"
              >
                <Pause className="size-4" />
                Pause
              </button>
            ) : (
              <button
                type="button"
                onClick={f.resume}
                className="press flex min-h-11 items-center gap-2 rounded-full bg-[var(--lf-pill-bg)] px-6 text-sm font-semibold whitespace-nowrap text-[var(--lf-pill-fg)]"
              >
                <Play className="size-4 fill-current" />
                Resume
              </button>
            )}

            <button
              type="button"
              onClick={f.reset}
              aria-label="Reset timer"
              className="press flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-full px-4 text-sm font-medium whitespace-nowrap text-[var(--lf-muted)] transition-colors hover:bg-[var(--lf-surface)] hover:text-[var(--lf-fg)]"
            >
              <RotateCcw className="size-4" />
              <span className="hidden sm:inline">Reset</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (timer.kind === "break") {
                  f.end();
                } else {
                  setConfirmEnd(true);
                }
              }}
              className="press min-h-11 rounded-full px-4 text-sm font-medium whitespace-nowrap text-[var(--lf-muted)] transition-colors hover:bg-[var(--lf-surface)] hover:text-[var(--lf-fg)]"
            >
              {timer.kind === "break" ? "Skip break" : "End"}
            </button>
          </div>
        )}
      </footer>

      {/* Discreet themed ambient sound picker overlay */}
      {ambientOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-4"
          onClick={() => setAmbientOpen(false)}
        >
          <div
            role="dialog"
            aria-label="Ambient sound"
            onClick={(e) => e.stopPropagation()}
            className="screen-in w-full max-w-sm rounded-3xl border border-[var(--lf-border)] bg-[var(--lf-sheet)] p-5 text-[var(--lf-fg)] shadow-xl"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Ambient sound</h2>
              <button
                type="button"
                onClick={() => setAmbientOpen(false)}
                aria-label="Close ambient sound menu"
                className="press flex min-h-11 min-w-11 items-center justify-center rounded-full text-[var(--lf-muted)] hover:bg-[var(--lf-surface)]"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {AMBIENT_OPTIONS.map((opt) => {
                const selected = settings.ambient === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      f.setSettings({ ambient: opt.id });
                      setAmbientOpen(false);
                    }}
                    className={cn(
                      "press min-h-11 rounded-2xl px-4 text-left text-sm font-medium transition-colors",
                      selected
                        ? "bg-[var(--lf-pill-bg)] text-[var(--lf-pill-fg)]"
                        : "bg-[var(--lf-surface)] text-[var(--lf-fg)] hover:bg-[var(--lf-surface-strong)]",
                    )}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
