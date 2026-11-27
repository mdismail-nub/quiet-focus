import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { useFocus, type Theme } from "@/lib/focus-store";
import type { Ambient } from "@/lib/ambient";
import { LANDSCAPE_THEMES } from "@/lib/landscape-themes";
import { Card, Header, PillButton, Sheet } from "@/components/ui-kit";
import { PWAInstallSettingsControl } from "@/components/PWAControls";
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
  const [notifyNote, setNotifyNote] = useState<string | null>(null);
  const [wakeLockSupported, setWakeLockSupported] = useState(true);

  useEffect(() => {
    setWakeLockSupported(typeof navigator !== "undefined" && "wakeLock" in navigator);
  }, []);

  const setDefault = (m: number) => {
    f.setSettings({ defaultMinutes: m });
    if (f.timer.status === "idle") f.selectMinutes(m);
  };

  const toggleNotify = async (v: boolean) => {
    setNotifyNote(null);
    if (!v) {
      f.setSettings({ notify: false });
      return;
    }
    if (typeof window === "undefined" || !("Notification" in window)) {
      setNotifyNote("Browser notifications are not supported on this device.");
      return;
    }
    if (Notification.permission === "granted") {
      f.setSettings({ notify: true });
      return;
    }
    try {
      const p = await Notification.requestPermission();
      if (p === "granted") {
        f.setSettings({ notify: true });
      } else {
        setNotifyNote("Notifications are blocked in browser settings.");
      }
    } catch {
      setNotifyNote("Unable to enable notifications in this browser.");
    }
  };

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
              setCustom(s.customMinutes);
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
        <Row label="Sound when complete">
          <Toggle
            label="Sound when complete"
            on={s.sound}
            onChange={(v) => f.setSettings({ sound: v })}
          />
        </Row>
        <Row label="Completion notification" hint={notifyNote ?? undefined}>
          <Toggle label="Completion notification" on={s.notify} onChange={toggleNotify} />
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

      <Sheet open={customOpen} onClose={() => setCustomOpen(false)}>
        <h2 className="text-xl font-semibold">Custom duration</h2>
        <label className="my-6 flex items-baseline justify-center gap-2">
          <input
            aria-label="Custom minutes"
            type="number"
            inputMode="numeric"
            value={custom}
            onChange={(e) => setCustom(Math.min(240, Math.max(1, Number(e.target.value) || 1)))}
            className="w-28 bg-transparent text-center text-5xl font-bold tabular-nums outline-hidden"
          />
          <span className="text-muted-foreground">min</span>
        </label>
        <PillButton
          onClick={() => {
            f.setSettings({ customMinutes: custom });
            setCustomOpen(false);
          }}
        >
          Save
        </PillButton>
      </Sheet>

      <Sheet open={ambientOpen} onClose={() => setAmbientOpen(false)}>
        <h2 className="text-xl font-semibold">Ambient sound</h2>
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
    </div>
  );
}
