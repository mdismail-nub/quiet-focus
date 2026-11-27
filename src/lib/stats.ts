export type Session = {
  id?: string;
  startedAt?: number;
  endedAt: number;
  minutes: number;
  label?: string;
  synced?: boolean;
  syncedAt?: number;
};

export function dayKey(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function startOfDay(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function computeStats(sessions: Session[], now: number = Date.now()) {
  const today = dayKey(now);
  const todaySessions = sessions.filter((s) => dayKey(s.endedAt) === today);
  const todayMinutes = todaySessions.reduce((a, s) => a + s.minutes, 0);

  const days = new Set(sessions.map((s) => dayKey(s.endedAt)));
  let streak = 0;
  const cursor = new Date(startOfDay(now));
  if (!days.has(dayKey(cursor.getTime()))) cursor.setDate(cursor.getDate() - 1);
  while (days.has(dayKey(cursor.getTime()))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }

  const week: { label: string; minutes: number; isToday: boolean }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(startOfDay(now));
    d.setDate(d.getDate() - i);
    const k = dayKey(d.getTime());
    week.push({
      label: d.toLocaleDateString(undefined, { weekday: "narrow" }),
      minutes: sessions.filter((s) => dayKey(s.endedAt) === k).reduce((a, s) => a + s.minutes, 0),
      isToday: i === 0,
    });
  }
  const weekMinutes = week.reduce((a, d) => a + d.minutes, 0);
  return { todayMinutes, todayCount: todaySessions.length, streak, week, weekMinutes };
}

export function formatMinutes(m: number): string {
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
}

export function remainingMs(endAt: number, now: number): number {
  return Math.max(0, endAt - now);
}

export function goalProgress(minutes: number, goal: number): number {
  if (goal <= 0) return 0;
  return Math.min(1, minutes / goal);
}

export function formatClock(ms: number): string {
  const s = Math.ceil(ms / 1000);
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
