import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Award, Check, Flame, Lock, Sparkles } from "lucide-react";
import { useFocus } from "@/lib/focus-store";
import { computeStats, formatMinutes, goalProgress } from "@/lib/stats";
import { BottomNav, Card, Header, SyncStatusChip } from "@/components/ui-kit";
import { FocusAnalytics } from "@/components/FocusAnalytics";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/progress")({
  head: () => ({
    meta: [
      { title: "Progress — Focus" },
      {
        name: "description",
        content: "Your focus time, XP level, daily streak, challenges, achievements and analytics.",
      },
      { property: "og:title", content: "Progress — Focus" },
      {
        property: "og:description",
        content: "Your focus time, XP level, daily streak, challenges, achievements and analytics.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProgressScreen,
});

function formatSessionTime(endedAt: number): string {
  const d = new Date(endedAt);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function formatUnlockDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function ProgressScreen() {
  const { sessions, settings, gamification, analytics, syncStatus, pendingCount, pendingMinutes } =
    useFocus();
  const s = computeStats(sessions);
  const hasGoal = settings.dailyGoal > 0;
  const gp = goalProgress(s.todayMinutes, settings.dailyGoal);
  const recent = [...sessions].reverse().slice(0, 5);
  const [achFilter, setAchFilter] = useState<"all" | "unlocked" | "locked">("all");

  const { levelInfo, streak, challenges, achievements, recentRewards } = gamification;
  const unlockedCount = achievements.filter((a) => a.unlocked).length;
  const filteredAchievements = achievements.filter((a) => {
    if (achFilter === "unlocked") return a.unlocked;
    if (achFilter === "locked") return !a.unlocked;
    return true;
  });

  return (
    <div className="screen-in flex min-h-dvh flex-col pb-28">
      <Header />

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight">Progress</h1>
          <p className="mt-1 text-sm text-muted-foreground">Small sessions add up.</p>
        </div>
        <SyncStatusChip status={syncStatus} pendingCount={pendingCount} />
      </div>

      {/* Today's focus & daily goal */}
      <Card className="mt-6">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm text-muted-foreground">Focused today</p>
          {hasGoal && (
            <p className="text-xs text-muted-foreground tabular-nums">
              {s.todayMinutes >= settings.dailyGoal
                ? "Daily goal reached"
                : `${formatMinutes(settings.dailyGoal - s.todayMinutes)} left of ${formatMinutes(settings.dailyGoal)}`}
            </p>
          )}
        </div>
        <div className="mt-1 flex items-baseline justify-between gap-3">
          <p className="text-5xl font-bold tracking-tight tabular-nums">
            {formatMinutes(s.todayMinutes)}
          </p>
          {pendingCount > 0 && (
            <span className="text-xs font-medium text-primary tabular-nums">
              {formatMinutes(pendingMinutes)} pending sync
            </span>
          )}
        </div>
        {hasGoal && (
          <div
            role="progressbar"
            aria-label="Daily focus goal"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(gp * 100)}
            className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-track"
          >
            <div
              className="motion-safe-transition h-full w-full origin-left rounded-full bg-primary transition-transform duration-300"
              style={{ transform: `scaleX(${gp})` }}
            />
          </div>
        )}
      </Card>

      {/* Daily streak & weekly activity calendar */}
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Card>
          <p className="text-sm text-muted-foreground">Sessions today</p>
          <p className="mt-1 text-3xl font-bold tabular-nums">{s.todayCount}</p>
        </Card>
        <Card>
          <p className="text-sm text-muted-foreground">Current streak</p>
          <div className="mt-1 flex items-center gap-2">
            <Flame
              className={cn(
                "size-6 shrink-0",
                streak.currentStreak > 0 ? "flame-pulse text-primary" : "text-muted-foreground/40",
              )}
              strokeWidth={1.85}
            />
            <p className="text-3xl font-bold tabular-nums">
              {streak.currentStreak}
              <span className="ml-1 text-base font-medium text-muted-foreground">
                {streak.currentStreak === 1 ? "day" : "days"}
              </span>
            </p>
          </div>
        </Card>
        <Card className="col-span-2 sm:col-span-1">
          <p className="text-sm text-muted-foreground">Longest streak</p>
          <p className="mt-1 text-3xl font-bold tabular-nums">
            {streak.longestStreak}
            <span className="ml-1 text-base font-medium text-muted-foreground">
              {streak.longestStreak === 1 ? "day" : "days"}
            </span>
          </p>
        </Card>
      </div>

      {/* Weekly streak calendar */}
      <Card className="mt-3">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-sm text-muted-foreground">Weekly goal calendar</p>
          <p className="text-xs text-muted-foreground tabular-nums">
            Goal: {formatMinutes(streak.goalMinutes)}/day
          </p>
        </div>
        <div className="mt-4 grid grid-cols-7 gap-2">
          {streak.calendar.map((day) => (
            <div key={day.dayKey} className="flex flex-col items-center gap-1.5">
              <span
                className={cn(
                  "text-[11px] font-medium",
                  day.isToday ? "font-semibold text-foreground" : "text-muted-foreground",
                )}
              >
                {day.label}
              </span>
              <div
                title={`${day.dayKey}: ${formatMinutes(day.minutes)}`}
                className={cn(
                  "flex size-9 items-center justify-center rounded-full border text-xs font-medium tabular-nums transition-colors",
                  day.completed
                    ? "border-primary bg-primary text-primary-foreground"
                    : day.isToday
                      ? "border-primary bg-primary-soft text-foreground"
                      : day.isUpcoming
                        ? "border-dashed border-border text-muted-foreground/50"
                        : "border-border bg-secondary/50 text-muted-foreground",
                )}
              >
                {day.completed ? <Check className="size-4" strokeWidth={2.25} /> : day.dateNum}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* XP & Leveling */}
      <Card className="mt-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-1.5">
              <Sparkles className="size-4 text-primary" strokeWidth={1.85} />
              <span className="text-xs font-semibold tracking-wide text-primary uppercase">
                Level {levelInfo.level}
              </span>
            </div>
            <p className="mt-0.5 text-xl font-semibold tracking-tight">{levelInfo.title}</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold tabular-nums">{levelInfo.totalXp} XP</p>
            <p className="text-xs text-muted-foreground tabular-nums">
              {levelInfo.isMax ? "Max level reached" : `${levelInfo.xpToNext} XP to next level`}
            </p>
          </div>
        </div>
        <div
          role="progressbar"
          aria-label="Level XP progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(levelInfo.progress * 100)}
          className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-track"
        >
          <div
            className="motion-safe-transition h-full w-full origin-left rounded-full bg-primary transition-transform duration-300"
            style={{ transform: `scaleX(${levelInfo.progress})` }}
          />
        </div>
        {recentRewards.length > 0 && (
          <div className="mt-4 border-t border-border pt-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Recent XP rewards</p>
            <div className="space-y-1.5">
              {recentRewards.slice(0, 3).map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-3 text-xs">
                  <span className="truncate text-foreground/85">{r.label}</span>
                  <span className="shrink-0 font-semibold text-primary tabular-nums">
                    +{r.xp} XP
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* Daily Challenges */}
      <section aria-labelledby="challenges-heading" className="mt-6">
        <div className="mb-2 flex items-baseline justify-between px-1">
          <h2 id="challenges-heading" className="text-xs font-medium text-muted-foreground">
            Daily challenges
          </h2>
          <span className="text-xs text-muted-foreground">Resets at midnight</span>
        </div>
        <Card className="divide-y divide-border py-1">
          {challenges.map((ch) => {
            const pct = Math.min(100, Math.round((ch.progress / Math.max(1, ch.target)) * 100));
            return (
              <div key={ch.id} className="py-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-sm font-medium">
                      {ch.completed && (
                        <Check className="size-4 shrink-0 text-primary" strokeWidth={2.25} />
                      )}
                      <span className={ch.completed ? "text-foreground" : ""}>{ch.title}</span>
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{ch.description}</p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums",
                      ch.completed
                        ? "bg-primary-soft text-primary"
                        : "bg-secondary text-muted-foreground",
                    )}
                  >
                    +{ch.xpReward} XP
                  </span>
                </div>
                <div className="mt-2.5 flex items-center gap-3">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-track">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-300"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-[11px] text-muted-foreground tabular-nums">
                    {ch.progress}/{ch.target}
                  </span>
                </div>
              </div>
            );
          })}
        </Card>
      </section>

      {/* Achievements & Badges */}
      <section aria-labelledby="achievements-heading" className="mt-6">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1">
          <h2 id="achievements-heading" className="text-xs font-medium text-muted-foreground">
            Achievements ({unlockedCount}/{achievements.length})
          </h2>
          <div className="flex rounded-full bg-secondary p-0.5 text-xs">
            {(["all", "unlocked", "locked"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setAchFilter(tab)}
                className={cn(
                  "press rounded-full px-2.5 py-1 capitalize transition-colors",
                  achFilter === tab
                    ? "bg-card font-medium text-foreground shadow-xs"
                    : "text-muted-foreground",
                )}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {filteredAchievements.map((ach) => (
            <Card
              key={ach.id}
              className={cn(
                "p-4 transition-colors",
                ach.unlocked ? "border-primary/35 bg-card" : "opacity-85",
              )}
            >
              <div className="flex items-start gap-3">
                <span
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-full",
                    ach.unlocked
                      ? "bg-primary-soft text-primary"
                      : "bg-secondary text-muted-foreground",
                  )}
                >
                  {ach.unlocked ? (
                    <Award className="size-4" strokeWidth={2} />
                  ) : (
                    <Lock className="size-4" strokeWidth={1.75} />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{ach.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{ach.description}</p>
                </div>
              </div>
              <div className="mt-3">
                {ach.unlocked && ach.unlockedAt ? (
                  <p className="text-[11px] font-medium text-primary">
                    Unlocked {formatUnlockDate(ach.unlockedAt)}
                  </p>
                ) : (
                  <div className="flex items-center gap-2">
                    <div className="h-1 flex-1 overflow-hidden rounded-full bg-track">
                      <div
                        className="h-full rounded-full bg-primary/70"
                        style={{ width: `${ach.progressPct}%` }}
                      />
                    </div>
                    <span className="text-[11px] text-muted-foreground tabular-nums">
                      {ach.progress}/{ach.target} {ach.unit}
                    </span>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* Personal Focus Analytics */}
      <FocusAnalytics analytics={analytics} />

      {/* Recent Sessions */}
      {recent.length > 0 && (
        <Card className="mt-6 py-2">
          <p className="py-2 text-sm text-muted-foreground">Recent sessions</p>
          <div className="divide-y divide-border">
            {recent.map((session, i) => (
              <div
                key={`${session.id ?? session.endedAt}-${i}`}
                className="flex items-center justify-between gap-4 py-2.5 text-sm"
              >
                <span className="min-w-0 truncate font-medium text-foreground">
                  {session.label?.trim() || "Focus session"}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {session.minutes}m · {formatSessionTime(session.endedAt)}
                  {session.synced === false ? " · local" : ""}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="flex-1" />
      <BottomNav />
    </div>
  );
}
