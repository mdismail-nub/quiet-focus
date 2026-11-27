import { createFileRoute } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { useFocus, type Theme } from "@/lib/focus-store";
import { Card, Header, PillButton, Sheet } from "@/components/ui-kit";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Focus" },
      { name: "description", content: "Adjust durations, sounds and appearance." },
      { property: "og:title", content: "Settings — Focus" },
      { property: "og:description", content: "Adjust durations, sounds and appearance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SettingsScreen,
});

function Row({ label, children }: { label: string; children: ReactNode }) {
  return <div className="flex min-h-14 items-center justify-between gap-4 border-b border-border py-3 last:border-0"><span className="text-[15px]">{label}</span>{children}</div>;
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
      className={cn("press relative h-7 w-12 shrink-0 rounded-full transition-colors", on ? "bg-primary" : "bg-track")}>
      <span className={cn("absolute top-0.5 left-0.5 size-6 rounded-full bg-card shadow-sm transition-transform", on && "translate-x-5")} />
    </button>
  );
}

function Segment<T extends string | number>({ value, options, onChange }: { value: T; options: { v: T; l: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex rounded-full bg-secondary p-1">
      {options.map((o) => (
        <button key={String(o.v)} onClick={() => onChange(o.v)}
          className={cn("press rounded-full px-3 py-1.5 text-sm", value === o.v ? "bg-card font-semibold shadow-sm" : "text-muted-foreground")}>{o.l}</button>
      ))}
    </div>
  );
}

function SettingsScreen() {
  const f = useFocus();
  const s = f.settings;
  const [customOpen, setCustomOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [custom, setCustom] = useState(s.customMinutes);

  const setDefault = (m: number) => {
    f.setSettings({ defaultMinutes: m });
    if (f.timer.status === "idle") f.selectMinutes(m);
  };

  const toggleNotify = async (v: boolean) => {
    if (v && "Notification" in window && Notification.permission !== "granted") {
      const p = await Notification.requestPermission();
      if (p !== "granted") return;
    }
    f.setSettings({ notify: v });
  };

  return (
    <div className="screen-in min-h-dvh pb-10">
      <Header back />
      <h1 className="mt-2 text-[26px] font-semibold tracking-tight">Settings</h1>

      <p className="mt-8 mb-2 px-1 text-xs font-semibold tracking-[0.14em] text-muted-foreground">TIMER</p>
      <Card className="py-1">
        <Row label="Default duration">
          <Segment value={s.defaultMinutes} onChange={setDefault} options={[25, 50, 90].map((v) => ({ v, l: `${v}` }))} />
        </Row>
        <Row label="Custom duration">
          <button className="press flex items-center gap-1 text-muted-foreground" onClick={() => { setCustom(s.customMinutes); setCustomOpen(true); }}>
            {s.customMinutes} min<ChevronRight className="size-4" />
          </button>
        </Row>
      </Card>

      <p className="mt-6 mb-2 px-1 text-xs font-semibold tracking-[0.14em] text-muted-foreground">ALERTS</p>
      <Card className="py-1">
        <Row label="Sound when complete"><Toggle label="Sound" on={s.sound} onChange={(v) => f.setSettings({ sound: v })} /></Row>
        <Row label="Completion notification"><Toggle label="Notification" on={s.notify} onChange={toggleNotify} /></Row>
      </Card>

      <p className="mt-6 mb-2 px-1 text-xs font-semibold tracking-[0.14em] text-muted-foreground">APPEARANCE</p>
      <Card className="py-1">
        <Row label="Theme">
          <Segment<Theme> value={s.theme} onChange={(v) => f.setSettings({ theme: v })} options={[{ v: "light", l: "Light" }, { v: "dark", l: "Dark" }, { v: "system", l: "Auto" }]} />
        </Row>
      </Card>

      <button className="press mt-8 w-full rounded-full py-3 text-sm font-medium text-coral" onClick={() => setConfirmReset(true)}>Reset statistics</button>

      <Sheet open={customOpen} onClose={() => setCustomOpen(false)}>
        <h2 className="text-xl font-semibold">Custom duration</h2>
        <label className="my-6 flex items-baseline justify-center gap-2">
          <input aria-label="Custom minutes" type="number" inputMode="numeric" value={custom}
            onChange={(e) => setCustom(Math.min(240, Math.max(1, Number(e.target.value) || 1)))}
            className="w-28 bg-transparent text-center text-5xl font-bold tabular-nums outline-hidden" />
          <span className="text-muted-foreground">min</span>
        </label>
        <PillButton onClick={() => { f.setSettings({ customMinutes: custom }); setCustomOpen(false); }}>Save</PillButton>
      </Sheet>

      <Sheet open={confirmReset} onClose={() => setConfirmReset(false)}>
        <h2 className="text-xl font-semibold">Reset all statistics?</h2>
        <p className="mt-2 text-sm text-muted-foreground">This removes your session history and streak. It can't be undone.</p>
        <div className="mt-6 space-y-2">
          <PillButton variant="danger" onClick={() => { f.clearStats(); setConfirmReset(false); }}>Reset statistics</PillButton>
          <PillButton variant="ghost" onClick={() => setConfirmReset(false)}>Cancel</PillButton>
        </div>
      </Sheet>
    </div>
  );
}
