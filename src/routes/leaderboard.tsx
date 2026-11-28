import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Crown, Flame, Lock, RefreshCw, Trophy, Users } from "lucide-react";
import type { DocumentSnapshot } from "firebase/firestore";
import { useFocus } from "@/lib/focus-store";
import { formatUserErrorMessage } from "@/lib/firebase";
import { formatMinutes } from "@/lib/stats";
import {
  AvatarBadge,
  BottomNav,
  Card,
  Header,
  PillButton,
  SyncStatusChip,
} from "@/components/ui-kit";
import {
  fetchFriendsLeaderboard,
  fetchLeaderboard,
  loadCachedLeaderboard,
  type LeaderboardPeriod,
  type LeaderboardRow,
} from "@/lib/social-service";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/leaderboard")({
  head: () => ({
    meta: [
      { title: "Leaderboard — Focus" },
      {
        name: "description",
        content: "Daily, weekly, all-time and friends verified focus leaderboards.",
      },
      { property: "og:title", content: "Leaderboard — Focus" },
      {
        property: "og:description",
        content: "Daily, weekly, all-time and friends verified focus leaderboards.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LeaderboardScreen,
});

const TABS: { id: LeaderboardPeriod; label: string }[] = [
  { id: "daily", label: "Daily" },
  { id: "weekly", label: "Weekly" },
  { id: "allTime", label: "All-time" },
  { id: "friends", label: "Friends" },
];

function LeaderboardScreen() {
  const f = useFocus();
  const [period, setPeriod] = useState<LeaderboardPeriod>("daily");
  const [friendsSubPeriod, setFriendsSubPeriod] = useState<"daily" | "weekly" | "allTime">("daily");
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [cursorDoc, setCursorDoc] = useState<DocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [showingCached, setShowingCached] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadBoard = useCallback(async () => {
    if (!f.user) {
      setRows(loadCachedLeaderboard(period));
      setShowingCached(true);
      setHasMore(false);
      return;
    }

    if (!f.serverOnline) {
      setRows(loadCachedLeaderboard(period));
      setShowingCached(true);
      setHasMore(false);
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setShowingCached(false);
    try {
      if (period === "friends") {
        const list = await fetchFriendsLeaderboard(f.user.uid, friendsSubPeriod);
        setRows(list);
        setCursorDoc(null);
        setHasMore(false);
      } else {
        const res = await fetchLeaderboard(period, 25, null);
        setRows(res.rows);
        setCursorDoc(res.lastDoc);
        setHasMore(res.hasMore && res.rows.length < 100);
      }
    } catch (err) {
      const cached = loadCachedLeaderboard(period);
      if (cached.length > 0) {
        setRows(cached);
        setShowingCached(true);
      }
      setErrorMsg(formatUserErrorMessage(err, "Could not load leaderboard."));
    } finally {
      setLoading(false);
    }
  }, [f.user, f.serverOnline, period, friendsSubPeriod]);

  useEffect(() => {
    if (f.authReady) {
      void loadBoard();
    }
  }, [f.authReady, f.leaderboardVersion, loadBoard]);

  const loadMore = async () => {
    if (period === "friends" || !cursorDoc || loadingMore || rows.length >= 100) return;
    setLoadingMore(true);
    try {
      const remainingCap = Math.max(1, 100 - rows.length);
      const res = await fetchLeaderboard(period, Math.min(25, remainingCap), cursorDoc);
      setRows((prev) => {
        const existingIds = new Set(prev.map((r) => r.userId));
        const next = res.rows.filter((r) => !existingIds.has(r.userId));
        return [...prev, ...next].slice(0, 100);
      });
      setCursorDoc(res.lastDoc);
      setHasMore(res.hasMore && rows.length + res.rows.length < 100);
    } catch (err) {
      setErrorMsg(formatUserErrorMessage(err, "Could not load more leaderboard entries."));
    } finally {
      setLoadingMore(false);
    }
  };

  const myIndex = f.user ? rows.findIndex((r) => r.userId === f.user?.uid) : -1;
  const myRow = myIndex >= 0 ? rows[myIndex] : null;
  const podium = rows.slice(0, 3);
  const rest = rows.slice(3);

  const myConfirmedMinutes = f.profile
    ? period === "daily" || (period === "friends" && friendsSubPeriod === "daily")
      ? f.profile.dailyMinutes
      : period === "weekly" || (period === "friends" && friendsSubPeriod === "weekly")
        ? f.profile.weeklyMinutes
        : f.profile.totalMinutes
    : 0;

  return (
    <div className="screen-in flex min-h-dvh flex-col pb-28">
      <Header />

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight">Leaderboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Verified focus rankings across the community.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SyncStatusChip status={f.syncStatus} pendingCount={f.pendingCount} />
          {f.user && f.serverOnline && (
            <button
              type="button"
              disabled={loading}
              onClick={() => void loadBoard()}
              aria-label="Refresh leaderboard"
              className="press flex size-11 items-center justify-center rounded-full border border-border bg-card text-muted-foreground hover:text-foreground disabled:opacity-45"
            >
              <RefreshCw className={cn("size-4", loading && "animate-spin")} />
            </button>
          )}
        </div>
      </div>

      {/* Category tabs */}
      <div
        role="tablist"
        aria-label="Leaderboard period"
        className="mt-5 grid grid-cols-4 gap-1 rounded-full border border-border bg-card p-1"
      >
        {TABS.map((t) => {
          const active = period === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setPeriod(t.id)}
              className={cn(
                "press rounded-full py-2 text-xs font-medium transition-colors sm:text-sm",
                active
                  ? "bg-ink text-ink-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {period === "friends" && (
        <div className="mt-3 flex items-center justify-between gap-2 px-1">
          <span className="text-xs text-muted-foreground">Friends ranking window</span>
          <div className="flex rounded-full bg-secondary p-0.5 text-xs">
            {(
              [
                { id: "daily", label: "Daily" },
                { id: "weekly", label: "Weekly" },
                { id: "allTime", label: "All-time" },
              ] as const
            ).map((sub) => (
              <button
                key={sub.id}
                type="button"
                onClick={() => setFriendsSubPeriod(sub.id)}
                className={cn(
                  "press rounded-full px-2.5 py-1 transition-colors",
                  friendsSubPeriod === sub.id
                    ? "bg-card font-medium text-foreground shadow-xs"
                    : "text-muted-foreground",
                )}
              >
                {sub.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Unauthenticated state */}
      {!f.user && (
        <Card className="mt-4">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
              <Trophy className="size-5" strokeWidth={1.75} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Sign in to join the leaderboard</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Your local timer sessions ({formatMinutes(f.analytics.lifetimeMinutes)} total) stay
                saved on this device and will synchronize automatically once you sign in.
              </p>
              {f.authError && <p className="mt-2 text-xs text-coral">{f.authError}</p>}
              <div className="mt-3 max-w-xs">
                <PillButton
                  className="h-10 text-xs"
                  disabled={f.signingIn}
                  onClick={() => void f.signInWithGoogle()}
                >
                  {f.signingIn ? "Signing in..." : "Continue with Google"}
                </PillButton>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Current User Position Highlight */}
      {f.user && f.profile && (
        <Card className="mt-4 border-primary/35 bg-primary-soft/60">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-card text-xs font-bold tabular-nums">
                {myIndex >= 0 ? `#${myIndex + 1}` : "—"}
              </span>
              <AvatarBadge username={f.profile.username} avatarId={f.profile.avatarId} size="sm" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  @{f.profile.username}{" "}
                  <span className="font-normal text-muted-foreground">(You)</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {f.profile.privacy === "private"
                    ? "Private profile · hidden from public rankings"
                    : f.profile.privacy === "friends"
                      ? "Friends-only · visible on Friends leaderboard"
                      : "Verified server ranking"}
                </p>
              </div>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-base font-bold tabular-nums">
                {formatMinutes(myRow ? myRow.minutes : myConfirmedMinutes)}
              </p>
              {f.pendingMinutes > 0 && (
                <p className="text-[11px] font-medium text-primary tabular-nums">
                  +{formatMinutes(f.pendingMinutes)} pending
                </p>
              )}
            </div>
          </div>
        </Card>
      )}

      {showingCached && rows.length > 0 && (
        <p className="mt-3 px-1 text-xs text-muted-foreground">
          Showing cached leaderboard snapshot. Rankings refresh automatically when online.
        </p>
      )}

      {errorMsg && (
        <Card className="mt-4 border-coral/30">
          <p className="text-xs text-coral">{errorMsg}</p>
        </Card>
      )}

      {/* Top 3 Podium */}
      {podium.length > 0 && (
        <div
          className="mt-4 grid grid-cols-3 items-end gap-2.5"
          aria-label="Top three focus leaders"
        >
          <PodiumSlot rank={2} row={podium[1]} isMe={podium[1]?.userId === f.user?.uid} />
          <PodiumSlot rank={1} row={podium[0]} isMe={podium[0]?.userId === f.user?.uid} />
          <PodiumSlot rank={3} row={podium[2]} isMe={podium[2]?.userId === f.user?.uid} />
        </div>
      )}

      {/* Remaining Ranked List */}
      {rest.length > 0 && (
        <Card className="mt-4 divide-y divide-border py-1">
          {rest.map((row, i) => {
            const rank = i + 4;
            const isMe = row.userId === f.user?.uid;
            return (
              <div
                key={row.userId}
                className={cn(
                  "flex items-center justify-between gap-3 py-3 transition-colors",
                  isMe && "-mx-3 rounded-xl bg-primary-soft px-3",
                )}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="w-6 shrink-0 text-center text-xs font-semibold text-muted-foreground tabular-nums">
                    {rank}
                  </span>
                  <AvatarBadge username={row.username} avatarId={row.avatarId} size="sm" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      @{row.username}
                      {isMe && <span className="ml-1.5 text-xs text-primary">(You)</span>}
                    </p>
                    <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span>Lv.{row.level}</span>
                      {row.currentStreak > 0 && (
                        <span className="inline-flex items-center gap-0.5 tabular-nums">
                          <Flame className="size-3 text-primary" />
                          {row.currentStreak}d
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                <span className="shrink-0 text-sm font-semibold tabular-nums">
                  {formatMinutes(row.minutes)}
                </span>
              </div>
            );
          })}
        </Card>
      )}

      {hasMore && (
        <div className="mt-4">
          <PillButton variant="outline" onClick={() => void loadMore()} disabled={loadingMore}>
            {loadingMore ? "Loading..." : "Load more"}
          </PillButton>
        </div>
      )}

      {/* Loading state */}
      {loading && rows.length === 0 && (
        <Card className="mt-4 text-center">
          <p className="text-xs text-muted-foreground">Loading rankings...</p>
        </Card>
      )}

      {/* Empty state */}
      {!loading && rows.length === 0 && (
        <Card className="mt-4 text-center">
          <div className="mx-auto flex size-11 items-center justify-center rounded-full bg-secondary text-muted-foreground">
            {period === "friends" ? (
              <Users className="size-5" strokeWidth={1.75} />
            ) : (
              <Lock className="size-5" strokeWidth={1.75} />
            )}
          </div>
          <p className="mt-3 text-sm font-semibold">
            {period === "friends"
              ? "No friends ranked yet"
              : "No verified sessions recorded in this window yet"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {period === "friends"
              ? "Add friends in the Social tab to compare daily, weekly, and lifetime focus."
              : "Complete a focus session while signed in to claim the top spot."}
          </p>
          {period === "friends" && (
            <Link
              to="/social"
              className="mt-4 inline-flex items-center justify-center rounded-full bg-secondary px-4 py-2 text-xs font-medium text-foreground"
            >
              Find friends
            </Link>
          )}
        </Card>
      )}

      <div className="flex-1" />
      <BottomNav />
    </div>
  );
}

function PodiumSlot({
  rank,
  row,
  isMe,
}: {
  rank: 1 | 2 | 3;
  row: LeaderboardRow | undefined;
  isMe: boolean;
}) {
  if (!row) {
    return (
      <div className="flex h-32 flex-col items-center justify-center rounded-[22px] border border-dashed border-border bg-card/40 p-3 text-center">
        <span className="text-xs font-semibold text-muted-foreground/60">#{rank}</span>
        <span className="mt-1 text-[11px] text-muted-foreground/50">Open</span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "screen-in flex flex-col items-center rounded-[22px] border bg-card p-3.5 text-center transition-transform",
        rank === 1
          ? "min-h-44 border-primary/50 shadow-sm"
          : rank === 2
            ? "min-h-36 border-border"
            : "min-h-32 border-border",
        isMe && "bg-primary-soft/45",
      )}
    >
      <div className="flex items-center gap-1 text-xs font-bold tabular-nums">
        {rank === 1 && <Crown className="size-3.5 text-primary" strokeWidth={2.25} />}
        <span className={rank === 1 ? "text-primary" : "text-muted-foreground"}>#{rank}</span>
      </div>
      <div className="mt-2">
        <AvatarBadge
          username={row.username}
          avatarId={row.avatarId}
          size={rank === 1 ? "md" : "sm"}
        />
      </div>
      <p className="mt-2 w-full truncate text-xs font-semibold">@{row.username}</p>
      <p className="mt-0.5 text-sm font-bold tabular-nums">{formatMinutes(row.minutes)}</p>
      <span className="mt-1 text-[10px] text-muted-foreground">Lv.{row.level}</span>
    </div>
  );
}
