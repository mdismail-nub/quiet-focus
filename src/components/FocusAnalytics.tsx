import { useEffect, useState } from "react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { Card } from "@/components/ui-kit";
import { formatMinutes } from "@/lib/stats";
import type { AnalyticsSummary, AnalyticsTimeframe } from "@/lib/gamification";
import { cn } from "@/lib/utils";

const TIMEFRAMES: { id: AnalyticsTimeframe; label: string }[] = [
  { id: "daily", label: "Daily" },
  { id: "weekly", label: "Weekly" },
  { id: "monthly", label: "Monthly" },
  { id: "yearly", label: "Yearly" },
];

export function FocusAnalytics({ analytics }: { analytics: AnalyticsSummary }) {
  const [timeframe, setTimeframe] = useState<AnalyticsTimeframe>("daily");
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  const points = analytics.series[timeframe];
  const chartTotal = points.reduce((sum, p) => sum + p.minutes, 0);

  return (
    <section aria-labelledby="analytics-heading" className="mt-6 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <h2 id="analytics-heading" className="text-xs font-medium text-muted-foreground">
          Focus analytics
        </h2>
        <div
          className="flex rounded-full bg-secondary p-0.5"
          role="tablist"
          aria-label="Analytics timeframe"
        >
          {TIMEFRAMES.map((tf) => {
            const active = timeframe === tf.id;
            return (
              <button
                key={tf.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTimeframe(tf.id)}
                className={cn(
                  "press rounded-full px-3 py-1 text-xs font-medium transition-colors",
                  active ? "bg-card text-foreground shadow-xs" : "text-muted-foreground",
                )}
              >
                {tf.label}
              </button>
            );
          })}
        </div>
      </div>

      <Card>
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">
              {timeframe === "daily"
                ? "Last 7 days"
                : timeframe === "weekly"
                  ? "Last 8 weeks"
                  : timeframe === "monthly"
                    ? "Last 14 days"
                    : "This year"}
            </p>
            <p className="mt-0.5 text-2xl font-bold tracking-tight tabular-nums">
              {formatMinutes(chartTotal)}
            </p>
          </div>
          <p className="text-xs text-muted-foreground tabular-nums">
            Lifetime: {formatMinutes(analytics.lifetimeMinutes)}
          </p>
        </div>

        <div className="mt-4 h-44 w-full min-w-0" data-testid="analytics-chart">
          {mounted && (
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={176}>
              <BarChart data={points} margin={{ top: 6, right: 2, left: 2, bottom: 0 }}>
                <XAxis
                  dataKey="label"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }}
                  interval={timeframe === "monthly" ? 1 : 0}
                />
                <Tooltip
                  cursor={{ fill: "var(--color-secondary)", opacity: 0.5 }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const p = payload[0]?.payload as {
                      label: string;
                      minutes: number;
                      sessions: number;
                    };
                    return (
                      <div className="rounded-xl border border-border bg-card px-3 py-2 text-xs shadow-sm">
                        <p className="font-semibold text-foreground">{p.label}</p>
                        <p className="mt-0.5 text-muted-foreground tabular-nums">
                          {formatMinutes(p.minutes)} · {p.sessions}{" "}
                          {p.sessions === 1 ? "session" : "sessions"}
                        </p>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="minutes" radius={[6, 6, 6, 6]} maxBarSize={26}>
                  {points.map((entry, idx) => (
                    <Cell
                      key={idx}
                      fill={entry.isCurrent ? "var(--color-primary)" : "var(--color-coral)"}
                      fillOpacity={entry.isCurrent ? 1 : 0.72}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <MetricCard label="Today" value={formatMinutes(analytics.todayMinutes)} />
        <MetricCard label="This week" value={formatMinutes(analytics.weekMinutes)} />
        <MetricCard label="This month" value={formatMinutes(analytics.monthMinutes)} />
        <MetricCard label="Lifetime" value={formatMinutes(analytics.lifetimeMinutes)} />
        <MetricCard label="Total sessions" value={String(analytics.totalSessions)} />
        <MetricCard label="Avg daily" value={formatMinutes(analytics.averageDailyMinutes)} />
        <MetricCard
          label="Longest session"
          value={
            analytics.longestSessionMinutes > 0
              ? formatMinutes(analytics.longestSessionMinutes)
              : "—"
          }
        />
        <MetricCard label="Best day" value={analytics.mostProductiveDay} />
        <MetricCard
          label="Peak focus time"
          value={analytics.mostProductiveTimeOfDay}
          className="col-span-2 sm:col-span-1"
        />
      </div>
    </section>
  );
}

function MetricCard({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <Card className={cn("p-4", className)}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-base leading-snug font-semibold tracking-tight tabular-nums">
        {value}
      </p>
    </Card>
  );
}
