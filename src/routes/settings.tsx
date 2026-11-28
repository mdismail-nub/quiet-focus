import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { Bell, ChevronRight, Volume2, X } from "lucide-react";
import { useFocus, type Theme } from "@/lib/focus-store";
import type { Ambient } from "@/lib/ambient";
import { CHIME_TONES, clampChimeVolume } from "@/lib/sound-notifications";
import { LANDSCAPE_THEMES } from "@/lib/landscape-themes";
import { Card, Header, PillButton, Sheet, SyncStatusChip } from "@/components/ui-kit";
import { PWAInstallSettingsControl } from "@/components/PWAControls";
import { NotificationOnboarding } from "@/components/NotificationOnboarding";
import { CustomBackgroundControls } from "@/components/CustomBackgroundControls";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Focus" },
      {
        name: "description",
        content: "Adjust durations, landscape themes, ambient sounds and goals.",
      },
      { property: "og:title", content: "Settings — Focus" },
      {
        property: "og:description",
        content: "Adjust durations, landscape themes, ambient sounds and goals.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SettingsScreen,
});

const AMBIENT_OPTIONS: { id: Ambient; label: string }[] = [
  { id: "off", label: "Off" },
  { id: "rain", label: "Rain" },
  { id: "ocean", label: "Ocean" },
  { id: "fire", label: "Fireplace" },
  { id: "white", label: "White noise" },
];

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

function Segment<T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { v: T; l: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex shrink-0 rounded-full bg-secondary p-1">
      {options.map((o) => (
        <button
          type="button"
          key={String(o.v)}
          onClick={() => onChange(o.v)}
          className={cn(
            "press rounded-full px-3 py-1.5 text-sm whitespace-nowrap",
            value === o.v ? "bg-card font-semibold shadow-sm" : "text-muted-foreground",
          )}
        >
          {o.l}
        </button>
      ))}
    </div>
  );
}

function SettingsScreen() {
  const f = useFocus();
  const s = f.settings;
  const [customOpen, setCustomOpen] = useState(false);
  const [ambientOpen, setAmbientOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [custom, setCustom] = useState(s.customMinutes);
  const [customDraft, setCustomDraft] = useState(String(s.customMinutes));
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [wakeLockSupported, setWakeLockSupported] = useState(true);

  useEffect(() => {
    setWakeLockSupported(typeof navigator !== "undefined" && "wakeLock" in navigator);
  }, []);

  const setDefault = (m: number) => {
    f.setSettings({ defaultMinutes: m });
    if (f.timer.status === "idle") f.selectMinutes(m);
  };

  const np = f.notificationPrefs;
  const notificationStatusText =
    f.notificationPermission === "unsupported"
      ? "Unsupported on this browser"
      : f.notificationPermission === "denied"
        ? "Blocked in browser settings"
        : np.enabled && f.notificationPermission === "granted"
          ? `Enabled · ${np.dailyMotivation ? `${np.dailyCount} daily` : "Sessions only"}`
          : "Not requested · Set up";

  const ambientLabel = AMBIENT_OPTIONS.find((a) => a.id === s.ambient)?.label ?? "Off";

  return (
    <div className="screen-in min-h-dvh pb-10">
      <Header back />
      <h1 className="mt-2 text-[26px] font-semibold tracking-tight">Settings</h1>

      <p className="mt-8 mb-2 px-1 text-xs font-medium text-muted-foreground">Timer</p>
      <Card className="py-1">
        <Row label="Default duration">
          <Segment
            value={s.defaultMinutes}
            onChange={setDefault}
            options={[25, 50, 90].map((v) => ({ v, l: `${v}` }))}
          />
        </Row>
        <Row label="Custom duration">
          <button
            type="button"
            className="press flex min-h-11 items-center gap-1 text-muted-foreground"
            onClick={() => {
              const clamped = Math.min(240, Math.max(1, s.customMinutes));
              setCustom(clamped);
              setCustomDraft(String(clamped));
              setCustomOpen(true);
            }}
          >
            {s.customMinutes} min
            <ChevronRight className="size-4" />
          </button>
        </Row>
        <Row label="Pomodoro breaks" hint="Offer a break after each focus session">
          <Toggle
            label="Pomodoro breaks"
            on={s.pomodoro}
            onChange={(v) => f.setSettings({ pomodoro: v })}
          />
        </Row>
        {s.pomodoro && (
          <Row label="Break duration">
            <Segment
              value={s.breakMinutes}
              onChange={(v) => f.setSettings({ breakMinutes: v })}
              options={[5, 10, 15].map((v) => ({ v, l: `${v}m` }))}
            />
          </Row>
        )}
      </Card>

      <p className="mt-6 mb-2 px-1 text-xs font-medium text-muted-foreground">Landscape mode</p>
      <Card>
        <p className="text-[15px]">Atmosphere theme</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Applied automatically when rotating to landscape or entering immersive focus.
        </p>
        <div
          className="mt-4 grid grid-cols-2 gap-2.5"
          role="radiogroup"
          aria-label="Landscape theme"
        >
          {LANDSCAPE_THEMES.map((theme) => {
            const selected = s.landscapeTheme === theme.id;
            return (
              <button
                key={theme.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => f.setSettings({ landscapeTheme: theme.id })}
                className={cn(
                  "press flex min-h-14 items-center gap-3 rounded-2xl border p-3 text-left transition-colors",
                  selected
                    ? "border-primary bg-primary-soft"
                    : "border-border bg-secondary/40 hover:bg-secondary/70",
                )}
              >
                <span
                  aria-hidden="true"
                  className="flex size-8 shrink-0 items-center justify-center rounded-full border border-black/10"
                  style={{ backgroundColor: theme.swatchBg }}
                >
                  <span
                    className="size-2.5 rounded-full"
                    style={{ backgroundColor: theme.swatchAccent }}
                  />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{theme.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {theme.description}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </Card>

      <p className="mt-6 mb-2 px-1 text-xs font-medium text-muted-foreground">
        Focus timer background
      </p>
      <Card>
        <p className="text-[15px]">Custom background image</p>
        <p className="mt-0.5 mb-4 text-xs text-muted-foreground">
          Upload your own image to display behind the timer while focusing. Works offline.
        </p>
        <CustomBackgroundControls />
      </Card>

      <p className="mt-6 mb-2 px-1 text-xs font-medium text-muted-foreground">Sound & focus</p>
      <Card className="py-1">
        <Row label="Ambient sound">
          <button
            type="button"
            className="press flex min-h-11 items-center gap-1 text-muted-foreground"
            onClick={() => setAmbientOpen(true)}
          >
            {ambientLabel}
            <ChevronRight className="size-4" />
          </button>
        </Row>
        <Row label="Gentle chimes" hint="Play a subtle chime when focus ends or a break starts">
          <Toggle
            label="Gentle chimes"
            on={s.sound}
            onChange={(v) => f.setSettings({ sound: v })}
          />
        </Row>
        {s.sound && (
          <div className="space-y-4 border-b border-border py-3.5">
            <div>
              <p className="text-[13px] font-medium text-muted-foreground">Chime tone</p>
              <div
                className="mt-2 grid grid-cols-3 gap-2"
                role="radiogroup"
                aria-label="Chime tone"
              >
                {CHIME_TONES.map((tone) => {
                  const selected = s.chimeTone === tone.id;
                  return (
                    <button
                      key={tone.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => {
                        f.setSettings({ chimeTone: tone.id });
                        f.previewChime("focus-end", tone.id);
                      }}
                      className={cn(
                        "press flex min-h-11 flex-col items-start justify-center rounded-2xl border px-3 py-2 text-left transition-colors",
                        selected
                          ? "border-primary bg-primary-soft text-foreground"
                          : "border-border bg-secondary/40 text-muted-foreground hover:bg-secondary/70",
                      )}
                    >
                      <span className="text-xs font-semibold text-foreground">{tone.label}</span>
                      <span className="mt-0.5 text-[11px] leading-tight text-muted-foreground">
                        {tone.description}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-[13px]">
                <span className="flex items-center gap-1.5 font-medium text-muted-foreground">
                  <Volume2 className="size-3.5" />
                  Chime volume
                </span>
                <span className="font-semibold tabular-nums text-foreground">
                  {Math.round(clampChimeVolume(s.chimeVolume) * 100)}%
                </span>
              </div>
              <input
                type="range"
                aria-label="Chime volume"
                min={0.1}
                max={1}
                step={0.05}
                value={clampChimeVolume(s.chimeVolume)}
                onChange={(e) =>
                  f.setSettings({ chimeVolume: clampChimeVolume(Number(e.target.value)) })
                }
                className="mt-2 h-2 w-full cursor-pointer accent-primary"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => f.previewChime("focus-end")}
                className="press rounded-full bg-secondary px-3.5 py-1.5 text-xs font-medium text-foreground hover:bg-secondary/80"
              >
                Test focus chime
              </button>
              <button
                type="button"
                onClick={() => f.previewChime("break-start")}
                className="press rounded-full bg-secondary px-3.5 py-1.5 text-xs font-medium text-foreground hover:bg-secondary/80"
              >
                Test break chime
              </button>
            </div>
          </div>
        )}
        <Row label="Focus Companion alerts" hint={notificationStatusText}>
          <div className="flex items-center gap-1">
            {!np.enabled && f.notificationPermission === "default" && (
              <button
                type="button"
                onClick={() => setOnboardingOpen(true)}
                className="press flex min-h-11 items-center gap-1 rounded-full px-2.5 text-xs font-semibold text-primary hover:bg-primary-soft"
              >
                <Bell className="size-3.5" />
                Guided setup
              </button>
            )}
            <Link
              to="/notifications"
              className="press flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              Manage
              <ChevronRight className="size-4" />
            </Link>
          </div>
        </Row>
        <Row
          label="Keep screen awake"
          hint={
            wakeLockSupported
              ? "Prevent screen sleep during active sessions"
              : "Screen wake lock is unavailable in this browser"
          }
        >
          <Toggle
            label="Keep screen awake"
            on={s.keepAwake}
            disabled={!wakeLockSupported}
            onChange={(v) => f.setSettings({ keepAwake: v })}
          />
        </Row>
      </Card>

      <p className="mt-6 mb-2 px-1 text-xs font-medium text-muted-foreground">Goals & appearance</p>
      <Card className="py-1">
        <Row label="Daily focus goal">
          <Segment
            value={s.dailyGoal}
            onChange={(v) => f.setSettings({ dailyGoal: v })}
            options={[
              { v: 0, l: "Off" },
              { v: 60, l: "1h" },
              { v: 120, l: "2h" },
              { v: 180, l: "3h" },
            ]}
          />
        </Row>
        <Row label="App theme">
          <Segment<Theme>
            value={s.theme}
            onChange={(v) => f.setSettings({ theme: v })}
            options={[
              { v: "light", l: "Light" },
              { v: "dark", l: "Dark" },
              { v: "system", l: "Auto" },
            ]}
          />
        </Row>
      </Card>

      <p className="mt-6 mb-2 px-1 text-xs font-medium text-muted-foreground">Account &amp; sync</p>
      <Card className="py-1">
        <Row
          label={f.profile ? `@${f.profile.username}` : "Profile & leaderboard"}
          hint={
            f.user
              ? `Privacy: ${f.profile?.privacy ?? "public"}`
              : "Sign in on Social to sync sessions to leaderboards"
          }
        >
          <Link
            to="/social"
            className="press flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            Manage
            <ChevronRight className="size-4" />
          </Link>
        </Row>
        <Row label="Cloud sync status">
          <SyncStatusChip status={f.syncStatus} pendingCount={f.pendingCount} />
        </Row>
      </Card>

      <p className="mt-6 mb-2 px-1 text-xs font-medium text-muted-foreground">App & offline</p>
      <Card className="py-1">
        <Row label="Install app" hint="Available offline with local session storage">
          <PWAInstallSettingsControl />
        </Row>
      </Card>

      <button
        type="button"
        className="press mt-8 w-full rounded-full py-3 text-sm font-medium text-coral"
        onClick={() => setConfirmReset(true)}
      >
        Reset statistics
      </button>

      <Sheet open={customOpen} onClose={() => setCustomOpen(false)} ariaLabel="Custom duration">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xl font-semibold">Custom duration</h2>
          <button
            type="button"
            onClick={() => setCustomOpen(false)}
            aria-label="Close custom duration"
            className="press flex min-h-10 min-w-10 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
        <label className="my-6 flex items-baseline justify-center gap-2">
          <input
            aria-label="Custom minutes"
            type="number"
            inputMode="numeric"
            min={1}
            max={240}
            value={customDraft}
            onChange={(e) => {
              const val = e.target.value;
              setCustomDraft(val);
              if (val.trim() !== "") {
                const parsed = Number(val);
                if (Number.isFinite(parsed) && parsed >= 1) {
                  setCustom(Math.min(240, Math.max(1, Math.round(parsed))));
                }
              }
            }}
            onBlur={() => {
              const parsed = Number(customDraft);
              const next =
                Number.isFinite(parsed) && customDraft.trim() !== ""
                  ? Math.min(240, Math.max(1, Math.round(parsed)))
                  : custom;
              setCustom(next);
              setCustomDraft(String(next));
            }}
            className="w-28 bg-transparent text-center text-5xl font-bold tabular-nums outline-hidden"
          />
          <span className="text-muted-foreground">min</span>
        </label>
        <PillButton
          onClick={() => {
            const parsed = Number(customDraft);
            const finalMin =
              Number.isFinite(parsed) && customDraft.trim() !== ""
                ? Math.min(240, Math.max(1, Math.round(parsed)))
                : custom;
            f.setSettings({ customMinutes: finalMin });
            setCustomOpen(false);
          }}
        >
          Save
        </PillButton>
      </Sheet>

      <Sheet open={ambientOpen} onClose={() => setAmbientOpen(false)} ariaLabel="Ambient sound">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xl font-semibold">Ambient sound</h2>
          <button
            type="button"
            onClick={() => setAmbientOpen(false)}
            aria-label="Close ambient sound"
            className="press flex min-h-10 min-w-10 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Plays quietly while a focus session is running.
        </p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          {AMBIENT_OPTIONS.map((opt) => {
            const selected = s.ambient === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  f.setSettings({ ambient: opt.id });
                  setAmbientOpen(false);
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

      <Sheet open={confirmReset} onClose={() => setConfirmReset(false)}>
        <h2 className="text-xl font-semibold">Reset all statistics?</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          This removes your session history and streak. It can't be undone.
        </p>
        <div className="mt-6 space-y-2">
          <PillButton
            variant="danger"
            onClick={() => {
              f.clearStats();
              setConfirmReset(false);
            }}
          >
            Reset statistics
          </PillButton>
          <PillButton variant="ghost" onClick={() => setConfirmReset(false)}>
            Cancel
          </PillButton>
        </div>
      </Sheet>

      <NotificationOnboarding open={onboardingOpen} onClose={() => setOnboardingOpen(false)} />
    </div>
  );
}
