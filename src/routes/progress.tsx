import { createFileRoute } from "@tanstack/react-router";
import { useFocus } from "@/lib/focus-store";
import { computeStats, formatMinutes } from "@/lib/stats";
import { BottomNav, Card, Header } from "@/components/ui-kit";

export const Route = createFileRoute("/progress")({
  head: () => ({
    meta: [
      { title: "Progress — Focus" },
      { name: "description", content: "Your focus time, sessions and streak." },
      { property: "og:title", content: "Progress — Focus" },
      { property: "og:description", content: "Your focus time, sessions and streak." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProgressScreen,
});

function ProgressScreen() {
  const { sessions } = useFocus();
  const s = computeStats(sessions);
  const max = Math.max(60, ...s.week.map((d) => d.minutes));
  return (
    <div className="screen-in flex min-h-dvh flex-col">
      <Header />
      <h1 className="mt-2 text-[26px] font-semibold tracking-tight">Progress</h1>
      <p className="mt-1 text-sm text-muted-foreground">Small sessions add up.</p>

      <Card className="mt-6">
        <p className="text-sm text-muted-foreground">Focused today</p>
        <p className="mt-1 text-5xl font-bold tracking-tight tabular-nums">{formatMinutes(s.todayMinutes)}</p>
      </Card>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <Card><p className="text-sm text-muted-foreground">Sessions today</p><p className="mt-1 text-3xl font-bold tabular-nums">{s.todayCount}</p></Card>
        <Card>
          <p className="text-sm text-muted-foreground">Daily streak</p>
          <p className="mt-1 text-3xl font-bold tabular-nums">{s.streak}<span className="ml-1 text-base font-medium text-muted-foreground">{s.streak === 1 ? "day" : "days"}</span></p>
        </Card>
      </div>

      <Card className="mt-3">
        <div className="flex items-baseline justify-between">
          <p className="text-sm text-muted-foreground">This week</p>
          <p className="text-lg font-semibold tabular-nums">{formatMinutes(s.weekMinutes)}</p>
        </div>
        <div className="mt-5 flex h-28 items-end gap-3">
          {s.week.map((d, i) => (
            <div key={i} className="flex flex-1 flex-col items-center gap-2">
              <div className="flex h-24 w-full items-end overflow-hidden rounded-full bg-track">
                <div className={d.isToday ? "w-full rounded-full bg-primary" : "w-full rounded-full bg-coral/70"} style={{ height: `${(d.minutes / max) * 100}%` }} title={formatMinutes(d.minutes)} />
              </div>
              <span className={d.isToday ? "text-xs font-semibold" : "text-xs text-muted-foreground"}>{d.label}</span>
            </div>
          ))}
        </div>
      </Card>
      <div className="flex-1" />
      <BottomNav />
    </div>
  );
}
