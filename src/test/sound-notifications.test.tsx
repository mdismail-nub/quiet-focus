import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CHIME_TONES,
  clampChimeVolume,
  getChimePattern,
  playGentleChime,
  resetChimeAudioForTests,
  shouldPlayTimerChime,
  warmUpChimeAudio,
} from "@/lib/sound-notifications";
import { FocusProvider, useFocus } from "@/lib/focus-store";

vi.mock("firebase/auth", () => ({
  onAuthStateChanged: (_auth: unknown, cb: (user: null) => void) => {
    cb(null);
    return () => {};
  },
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("@/lib/firebase", () => ({
  auth: {},
  googleProvider: {},
  testConnection: vi.fn().mockResolvedValue(undefined),
  formatFirebaseAuthError: vi.fn(() => null),
  formatUserErrorMessage: vi.fn((_err: unknown, fallback: string) => fallback),
}));

vi.mock("@/lib/sync-service", () => ({
  checkServerConnectivity: vi.fn().mockResolvedValue(false),
  enqueuePendingSession: vi.fn(() => []),
  loadSyncQueue: vi.fn(() => []),
  saveSyncQueue: vi.fn(),
  syncPendingSessions: vi.fn(),
}));

vi.mock("@/lib/notification-db", () => ({
  loadNotificationRecord: vi.fn().mockResolvedValue({
    preferences: {
      enabled: false,
      sessionOngoing: true,
      sessionCompletion: true,
      dailyMotivation: false,
      breakReminders: true,
      dailyCount: 2,
      morningTime: "09:00",
      afternoonTime: "14:00",
      eveningTime: "20:00",
      customTimes: [],
      quietHoursEnabled: false,
      quietStart: "22:00",
      quietEnd: "07:00",
      activeWeekdays: [1, 2, 3, 4, 5],
      sound: true,
      timezone: "UTC",
    },
    pushEndpoint: null,
    pendingSync: false,
  }),
  saveNotificationRecord: vi.fn().mockResolvedValue(undefined),
  saveTimerSnapshotToDB: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/notification-client", () => ({
  cancelSessionScheduleOnServer: vi.fn().mockResolvedValue(undefined),
  closeAppNotificationsByTag: vi.fn().mockResolvedValue(undefined),
  getNotificationSupport: vi.fn(() => ({
    notifications: false,
    serviceWorker: false,
    pushManager: false,
    isSecureContext: true,
    platformHint: "other",
  })),
  getPermissionState: vi.fn(() => "default"),
  requestNotificationPermissionExplicit: vi.fn().mockResolvedValue("default"),
  sendServerOrLocalTestNotification: vi.fn().mockResolvedValue({
    ok: true,
    via: "local",
    message: "Test notification sent",
  }),
  showAppNotification: vi.fn().mockResolvedValue(false),
  syncPushSubscriptionAndPrefs: vi.fn().mockResolvedValue({
    subscribed: false,
    offline: true,
  }),
  syncSessionScheduleToServer: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/ambient", () => ({
  startAmbient: vi.fn(() => () => {}),
}));

interface OscillatorSpyRecord {
  type: OscillatorType;
  frequencyValue: number;
  startedAt: number | null;
  stoppedAt: number | null;
  peakGain: number | null;
}

function installAudioContextMock(initialState: AudioContextState = "suspended") {
  const oscillators: OscillatorSpyRecord[] = [];
  let instancesCreated = 0;
  let resumeCalls = 0;
  let state: AudioContextState = initialState;

  class MockAudioContext {
    currentTime = 10;
    destination = {} as AudioDestinationNode;

    constructor() {
      instancesCreated += 1;
    }

    get state() {
      return state;
    }

    resume = vi.fn(async () => {
      resumeCalls += 1;
      state = "running";
    });

    close = vi.fn(async () => {
      state = "closed";
    });

    createBiquadFilter = vi.fn(() => ({
      type: "lowpass" as BiquadFilterType,
      frequency: { value: 0 },
      connect: vi.fn((dest: unknown) => dest),
    }));

    createGain = vi.fn(() => {
      let maxVal = 0;
      const gainNode = {
        _setPeak: (v: number) => {
          if (v > maxVal) maxVal = v;
        },
        _getPeak: () => maxVal,
        gain: {
          setValueAtTime: vi.fn(),
          linearRampToValueAtTime: vi.fn((v: number) => {
            if (v > maxVal) maxVal = v;
          }),
          exponentialRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn((dest: unknown) => dest),
      };
      return gainNode;
    });

    createOscillator = vi.fn(() => {
      const record: OscillatorSpyRecord = {
        type: "sine",
        frequencyValue: 0,
        startedAt: null,
        stoppedAt: null,
        peakGain: null,
      };
      oscillators.push(record);
      let connectedGain: { _getPeak?: () => number } | null = null;
      return {
        set type(t: OscillatorType) {
          record.type = t;
        },
        get type() {
          return record.type;
        },
        frequency: {
          set value(v: number) {
            record.frequencyValue = v;
          },
          get value() {
            return record.frequencyValue;
          },
        },
        connect: vi.fn((node: { _getPeak?: () => number }) => {
          connectedGain = node;
          return node;
        }),
        start: vi.fn((t = 0) => {
          record.startedAt = t;
          if (connectedGain && typeof connectedGain._getPeak === "function") {
            record.peakGain = connectedGain._getPeak();
          }
        }),
        stop: vi.fn((t = 0) => {
          record.stoppedAt = t;
        }),
      };
    });
  }

  Object.defineProperty(window, "AudioContext", {
    configurable: true,
    writable: true,
    value: MockAudioContext,
  });

  return {
    oscillators,
    getInstancesCreated: () => instancesCreated,
    getResumeCalls: () => resumeCalls,
  };
}

describe("sound-notifications engine", () => {
  beforeEach(() => {
    resetChimeAudioForTests();
    localStorage.clear();
  });

  afterEach(() => {
    resetChimeAudioForTests();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("provides distinct gentle patterns across all tones and events", () => {
    for (const tone of CHIME_TONES) {
      const focusEnd = getChimePattern(tone.id, "focus-end");
      const breakStart = getChimePattern(tone.id, "break-start");
      const breakEnd = getChimePattern(tone.id, "break-end");

      expect(focusEnd.length).toBeGreaterThanOrEqual(2);
      expect(breakStart.length).toBeGreaterThanOrEqual(2);
      expect(breakEnd.length).toBeGreaterThanOrEqual(2);
      expect(focusEnd.map((n) => n.freq)).not.toEqual(breakStart.map((n) => n.freq));
      // Break start descends smoothly to cue relaxation
      expect(breakStart[1]!.freq).toBeLessThan(breakStart[0]!.freq);
    }
  });

  it("clamps volume cleanly and enforces mute rules", () => {
    expect(clampChimeVolume(undefined)).toBe(0.6);
    expect(clampChimeVolume(Number.NaN)).toBe(0.6);
    expect(clampChimeVolume(0)).toBe(0.1);
    expect(clampChimeVolume(2)).toBe(1);
    expect(clampChimeVolume(0.45)).toBe(0.45);

    expect(
      shouldPlayTimerChime({ settingsSound: false, companionEnabled: false, companionSound: true }),
    ).toBe(false);
    expect(
      shouldPlayTimerChime({ settingsSound: true, companionEnabled: true, companionSound: false }),
    ).toBe(false);
    expect(
      shouldPlayTimerChime({ settingsSound: true, companionEnabled: false, companionSound: false }),
    ).toBe(true);
    expect(
      shouldPlayTimerChime({ settingsSound: true, companionEnabled: true, companionSound: true }),
    ).toBe(true);
  });

  it("reuses a single AudioContext, resumes on warmup, and keeps gains subtle", () => {
    const mock = installAudioContextMock("suspended");

    expect(warmUpChimeAudio()).toBe(true);
    expect(mock.getInstancesCreated()).toBe(1);
    expect(mock.getResumeCalls()).toBe(1);

    expect(playGentleChime("focus-end", { tone: "gentle-bell", volume: 1 })).toBe(true);
    expect(playGentleChime("break-start", { tone: "minimal-tone", volume: 0.5 })).toBe(true);
    // Single shared AudioContext instance reused across calls
    expect(mock.getInstancesCreated()).toBe(1);

    // Gentle bell focus-end has 3 fundamental + 3 soft octave overtones = 6; minimal break-start has 2 = 8 total
    expect(mock.oscillators.length).toBe(8);
    for (const osc of mock.oscillators) {
      expect(osc.type).toBe("sine");
      expect(osc.startedAt).not.toBeNull();
      expect(osc.stoppedAt).not.toBeNull();
      expect(osc.peakGain).not.toBeNull();
      expect(osc.peakGain!).toBeLessThanOrEqual(0.17);
    }
  });

  it("degrades safely when AudioContext is unavailable or throws", () => {
    Object.defineProperty(window, "AudioContext", {
      configurable: true,
      writable: true,
      value: undefined,
    });
    expect(warmUpChimeAudio()).toBe(false);
    expect(playGentleChime("focus-end")).toBe(false);

    Object.defineProperty(window, "AudioContext", {
      configurable: true,
      writable: true,
      value: () => {
        throw new Error("Audio blocked");
      },
    });
    expect(warmUpChimeAudio()).toBe(false);
    expect(playGentleChime("break-start")).toBe(false);
  });
});

describe("FocusProvider timer chime integration", () => {
  beforeEach(() => {
    resetChimeAudioForTests();
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T10:00:00.000Z"));
  });

  afterEach(() => {
    resetChimeAudioForTests();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function Harness() {
    const f = useFocus();
    return (
      <div>
        <span data-testid="status">{f.timer.status}</span>
        <span data-testid="kind">{f.timer.kind}</span>
        <button type="button" onClick={() => f.selectMinutes(1)}>
          1m
        </button>
        <button type="button" onClick={() => f.start()}>
          start
        </button>
        <button type="button" onClick={() => f.startBreak()}>
          break
        </button>
        <button type="button" onClick={() => f.setSettings({ sound: false })}>
          mute
        </button>
        <button
          type="button"
          onClick={() => f.setSettings({ sound: true, chimeTone: "minimal-tone", breakMinutes: 1 })}
        >
          minimal
        </button>
        <button
          type="button"
          onClick={() => f.setNotificationPrefs({ enabled: true, sound: false })}
        >
          mute-companion
        </button>
      </div>
    );
  }

  it("warms up on start, plays focus-end when focus completes, break-start on break, and break-end when break completes", async () => {
    const mock = installAudioContextMock("suspended");

    render(
      <FocusProvider>
        <Harness />
      </FocusProvider>,
    );

    await act(async () => {
      screen.getByText("minimal").click();
      screen.getByText("1m").click();
    });

    await act(async () => {
      screen.getByText("start").click();
    });

    expect(screen.getByTestId("status")).toHaveTextContent("running");
    expect(mock.getResumeCalls()).toBe(1);
    expect(mock.oscillators.length).toBe(0);

    // Advance past 1 minute to complete focus session
    await act(async () => {
      vi.advanceTimersByTime(60_500);
    });

    expect(screen.getByTestId("status")).toHaveTextContent("completed");
    // minimal-tone focus-end plays 659.25 Hz and 880 Hz
    expect(mock.oscillators.map((o) => o.frequencyValue)).toEqual([659.25, 880]);

    // Start break -> plays break-start chime immediately
    await act(async () => {
      screen.getByText("break").click();
    });
    expect(screen.getByTestId("kind")).toHaveTextContent("break");
    expect(screen.getByTestId("status")).toHaveTextContent("running");
    expect(mock.oscillators.slice(2).map((o) => o.frequencyValue)).toEqual([587.33, 493.88]);

    // Advance past 1 minute break -> plays break-end chime
    await act(async () => {
      vi.advanceTimersByTime(60_500);
    });
    expect(screen.getByTestId("status")).toHaveTextContent("idle");
    expect(mock.oscillators.slice(4).map((o) => o.frequencyValue)).toEqual([587.33, 783.99]);
  });

  it("stays silent when settings.sound is off or companion notification sound is muted", async () => {
    const mock = installAudioContextMock("running");

    render(
      <FocusProvider>
        <Harness />
      </FocusProvider>,
    );

    await act(async () => {
      screen.getByRole("button", { name: "1m" }).click();
      screen.getByRole("button", { name: "mute" }).click();
    });

    await act(async () => {
      screen.getByRole("button", { name: "start" }).click();
    });

    await act(async () => {
      vi.advanceTimersByTime(60_500);
    });
    expect(screen.getByTestId("status")).toHaveTextContent("completed");
    expect(mock.oscillators.length).toBe(0);

    await act(async () => {
      screen.getByRole("button", { name: "break" }).click();
    });
    expect(screen.getByTestId("status")).toHaveTextContent("running");
    expect(mock.oscillators.length).toBe(0);

    // Finish muted break first, then re-enable master sound & mute via companion sound toggle
    await act(async () => {
      vi.advanceTimersByTime(5 * 60_000 + 500);
    });
    expect(screen.getByTestId("status")).toHaveTextContent("idle");

    await act(async () => {
      screen.getByRole("button", { name: "minimal" }).click();
      screen.getByRole("button", { name: "mute-companion" }).click();
    });

    await act(async () => {
      screen.getByRole("button", { name: "break" }).click();
    });
    expect(screen.getByTestId("status")).toHaveTextContent("running");
    expect(mock.oscillators.length).toBe(0);
  });
});
