import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Check, Minus, Plus } from "lucide-react";
import { useFocus } from "@/lib/focus-store";
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

function fmt(ms: number) {
  const s = Math.ceil(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function FocusScreen() {
  const f = useFocus();
  const [customOpen, setCustomOpen] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const { timer } = f;

  if (timer.status === "completed") return <Completed />;

  const active = timer.status === "running" || timer.status === "paused";
  const total = timer.minutes * 60000;
  const progress = active ? 1 - f.left / total : 0;
  const isCustom = !PRESETS.includes(timer.minutes);

  return (
    <div className="screen-in flex min-h-dvh flex-col">
      <Header />
      {!active ? (
        <p className="mt-2 text-[26px] font-semibold tracking-tight">Ready to focus?</p>
      ) : (
        <p className="mt-2 text-[26px] font-semibold tracking-tight">{timer.status === "paused" ? "Paused" : "Stay focused"}</p>
      )}
      <p className="mt-1 text-sm text-muted-foreground">{active ? `${timer.minutes} minute session` : "Choose a duration and begin."}</p>

      <div className="flex flex-1 flex-col justify-center py-8">
        <TimerRing progress={progress}>
          <span className="text-[11px] font-semibold tracking-[0.18em] text-primary">FOCUS SESSION</span>
          <span className="mt-2 text-6xl font-bold tabular-nums tracking-tight" aria-live="off">{f.ready ? fmt(f.left) : "--:--"}</span>
          <span className="mt-3 text-sm text-muted-foreground">One thing at a time.</span>
        </TimerRing>
      </div>

      {!active && (
        <div className="mb-5 grid grid-cols-4 gap-2" role="radiogroup" aria-label="Duration">
          {PRESETS.map((m) => (
            <Chip key={m} selected={timer.minutes === m} onClick={() => f.selectMinutes(m)}>{m} min</Chip>
          ))}
          <Chip selected={isCustom} onClick={() => setCustomOpen(true)}>{isCustom ? `${timer.minutes} min` : "Custom"}</Chip>
        </div>
      )}

      <div className="space-y-1 pb-2">
        {timer.status === "idle" && <PillButton onClick={f.start}>Start focusing</PillButton>}
        {timer.status === "running" && <PillButton onClick={f.pause}>Pause</PillButton>}
        {timer.status === "paused" && <PillButton onClick={f.resume}>Resume</PillButton>}
        {active ? (
          <div className="grid grid-cols-2">
            <PillButton variant="ghost" onClick={f.reset}>Reset</PillButton>
            <PillButton variant="ghost" onClick={() => setConfirmEnd(true)}>End session</PillButton>
          </div>
        ) : <div className="h-11" />}
      </div>

      {!active && <BottomNav />}

      <CustomSheet open={customOpen} onClose={() => setCustomOpen(false)} />
      <Sheet open={confirmEnd} onClose={() => setConfirmEnd(false)}>
        <h2 className="text-xl font-semibold">End this session?</h2>
        <p className="mt-2 text-sm text-muted-foreground">Your progress on this session won't be saved.</p>
        <div className="mt-6 space-y-2">
          <PillButton onClick={() => { f.end(); setConfirmEnd(false); }}>End session</PillButton>
          <PillButton variant="ghost" onClick={() => setConfirmEnd(false)}>Keep focusing</PillButton>
        </div>
      </Sheet>
    </div>
  );
}

function Chip({ selected, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { selected: boolean }) {
  return (
    <button
      role="radio"
      aria-checked={selected}
      {...p}
      className={cn(
        "press h-11 rounded-full border text-sm font-medium transition-colors",
        selected ? "border-primary bg-primary-soft text-foreground" : "border-border bg-card text-muted-foreground",
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
        <button aria-label="Less" className="press rounded-full border border-border p-3" onClick={() => setM((v) => clamp(v - 5))}><Minus className="size-5" /></button>
        <label className="flex items-baseline gap-1">
          <input
            aria-label="Minutes" type="number" inputMode="numeric" value={m}
            onChange={(e) => setM(clamp(Number(e.target.value) || 1))}
            className="w-24 bg-transparent text-center text-5xl font-bold tabular-nums outline-hidden"
          />
          <span className="text-muted-foreground">min</span>
        </label>
        <button aria-label="More" className="press rounded-full border border-border p-3" onClick={() => setM((v) => clamp(v + 5))}><Plus className="size-5" /></button>
      </div>
      <PillButton onClick={() => { f.setSettings({ customMinutes: m }); f.selectMinutes(m); onClose(); }}>Set {m} minutes</PillButton>
    </Sheet>
  );
}

function Completed() {
  const f = useFocus();
  return (
    <div className="screen-in flex min-h-dvh flex-col">
      <Header />
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <div className="relative flex size-28 items-center justify-center">
          <span className="done-pulse absolute inset-0 rounded-full bg-primary-soft" />
          <span className="done-pop relative flex size-20 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Check className="size-9" strokeWidth={2.5} />
          </span>
        </div>
        <h1 className="mt-8 text-[32px] font-bold tracking-tight">Session completed!</h1>
        <p className="mt-2 max-w-xs text-muted-foreground">Great work. You made time for what matters.</p>
        <div className="mt-8 rounded-full border border-border bg-card px-5 py-2 text-sm">
          <span className="text-muted-foreground">Focused for </span><span className="font-semibold">{f.timer.minutes} min</span>
        </div>
      </div>
      <div className="space-y-1 pb-6">
        <PillButton onClick={() => { f.dismiss(); f.start(); }}>Start another session</PillButton>
        <PillButton variant="ghost" onClick={f.dismiss}>Back to home</PillButton>
      </div>
    </div>
  );
}
