import { describe, expect, it } from "vitest";
import { computeStats, remainingMs } from "../lib/stats";

const day = 86400000;
const now = new Date(2026, 10, 27, 15).getTime();

describe("stats", () => {
  it("counts today's sessions and minutes", () => {
    const s = computeStats([{ endedAt: now - 1000, minutes: 25 }, { endedAt: now - 2000, minutes: 50 }, { endedAt: now - day, minutes: 90 }], now);
    expect(s.todayCount).toBe(2);
    expect(s.todayMinutes).toBe(75);
    expect(s.weekMinutes).toBe(165);
  });
  it("streak counts consecutive days and survives an empty today", () => {
    expect(computeStats([{ endedAt: now - day, minutes: 25 }, { endedAt: now - 2 * day, minutes: 25 }], now).streak).toBe(2);
    expect(computeStats([{ endedAt: now - 3 * day, minutes: 25 }], now).streak).toBe(0);
  });
  it("remaining time comes from the end timestamp, not ticks", () => {
    expect(remainingMs(now + 5000, now)).toBe(5000);
    expect(remainingMs(now - 5000, now)).toBe(0);
  });
});
