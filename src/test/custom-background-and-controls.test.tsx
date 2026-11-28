import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clampBackgroundDim, processUploadedBackgroundFile } from "@/lib/custom-background-db";
import { FocusProvider, useFocus } from "@/lib/focus-store";
import { Sheet } from "@/components/ui-kit";
import { LandscapeFocus } from "@/components/LandscapeFocus";
import { NotificationsScreen } from "@/routes/notifications";

vi.mock("@tanstack/react-router", async () => {
  const actual =
    await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router");
  return {
    ...actual,
    Link: ({
      children,
      to,
      ...rest
    }: {
      children: React.ReactNode;
      to: string;
      [k: string]: unknown;
    }) => (
      <a href={to} {...rest}>
        {children}
      </a>
    ),
  };
});

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
  checkServerConnectivity: vi.fn().mockResolvedValue(true),
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
      onboardingCompleted: false,
      onboardingDismissed: false,
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
    notificationApi: true,
    serviceWorker: false,
    pushManager: false,
    actionsSupported: false,
    isIOS: false,
    isStandalone: false,
    iosNeedsHomeScreen: false,
  })),
  getPermissionState: vi.fn(() => "default"),
  requestNotificationPermissionExplicit: vi.fn().mockResolvedValue("default"),
  sendServerOrLocalTestNotification: vi.fn().mockResolvedValue({
    ok: false,
    via: "none",
    message: "Permission required",
  }),
  showAppNotification: vi.fn().mockResolvedValue(false),
  syncPushSubscriptionAndPrefs: vi.fn().mockResolvedValue({
    subscribed: false,
    offline: false,
  }),
  syncSessionScheduleToServer: vi.fn().mockResolvedValue({ scheduled: false, offline: false }),
}));

vi.mock("@/lib/ambient", () => ({
  startAmbient: vi.fn(() => () => {}),
}));

vi.mock("@/components/PWAControls", () => ({
  PWAInstallHeaderButton: () => null,
  PWAInstallSettingsControl: () => <span>Installed</span>,
}));

describe("custom background storage & validation", () => {
  it("clamps overlay dim safely between 0.15 and 0.75", () => {
    expect(clampBackgroundDim(undefined)).toBe(0.4);
    expect(clampBackgroundDim(Number.NaN)).toBe(0.4);
    expect(clampBackgroundDim(0.02)).toBe(0.15);
    expect(clampBackgroundDim(0.95)).toBe(0.75);
    expect(clampBackgroundDim(0.55)).toBe(0.55);
  });

  it("rejects non-image, empty, and oversized files and accepts valid image files", async () => {
    const textFile = new File(["hello"], "notes.txt", { type: "text/plain" });
    await expect(processUploadedBackgroundFile(textFile)).rejects.toThrow(/image file/i);

    const emptyFile = new File([], "empty.png", { type: "image/png" });
    await expect(processUploadedBackgroundFile(emptyFile)).rejects.toThrow(/empty/i);

    const hugeFile = {
      name: "huge.jpg",
      type: "image/jpeg",
      size: 16 * 1024 * 1024,
    } as unknown as File;
    await expect(processUploadedBackgroundFile(hugeFile)).rejects.toThrow(/too large/i);

    const pngBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const validImage = new File([pngBytes], "forest-desk.png", { type: "image/png" });
    const processed = await processUploadedBackgroundFile(validImage);
    expect(processed.name).toBe("forest-desk.png");
    expect(processed.dataUrl.startsWith("data:image/png;base64,")).toBe(true);
  });
});

describe("FocusProvider synchronous timer & custom background integration", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function Harness() {
    const f = useFocus();
    const pngFile = new File([new Uint8Array([137, 80, 78, 71])], "mountain.png", {
      type: "image/png",
    });

    return (
      <div>
        <span data-testid="minutes">{f.timer.minutes}</span>
        <span data-testid="status">{f.timer.status}</span>
        <span data-testid="bg-enabled">{String(f.settings.customBackgroundEnabled)}</span>
        <span data-testid="bg-name">{f.settings.customBackgroundName}</span>
        <span data-testid="bg-url">{f.customBackgroundUrl ?? ""}</span>
        <button
          type="button"
          onClick={() => {
            f.selectMinutes(1);
            f.start();
          }}
        >
          chain-select-start
        </button>
        <button type="button" onClick={() => void f.uploadCustomBackground(pngFile)}>
          upload-bg
        </button>
        <button type="button" onClick={() => void f.clearCustomBackground()}>
          clear-bg
        </button>
      </div>
    );
  }

  it("handles chained selectMinutes + start synchronously in one tick", async () => {
    render(
      <FocusProvider>
        <Harness />
      </FocusProvider>,
    );

    await act(async () => {
      screen.getByText("chain-select-start").click();
    });

    expect(screen.getByTestId("minutes")).toHaveTextContent("1");
    expect(screen.getByTestId("status")).toHaveTextContent("running");
  });

  it("uploads, enables, and clears custom focus timer background", async () => {
    render(
      <FocusProvider>
        <Harness />
      </FocusProvider>,
    );

    await act(async () => {
      screen.getByText("upload-bg").click();
    });

    await waitFor(() => {
      expect(screen.getByTestId("bg-enabled")).toHaveTextContent("true");
      expect(screen.getByTestId("bg-name")).toHaveTextContent("mountain.png");
      expect(screen.getByTestId("bg-url").textContent).toContain("data:image/png");
    });

    await act(async () => {
      screen.getByText("clear-bg").click();
    });

    await waitFor(() => {
      expect(screen.getByTestId("bg-enabled")).toHaveTextContent("false");
      expect(screen.getByTestId("bg-url")).toHaveTextContent("");
    });
  });
});

describe("UI responsiveness & custom background display", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("dismisses Sheet on Escape key press", () => {
    const onClose = vi.fn();
    render(
      <Sheet open={true} onClose={onClose} ariaLabel="Sample modal">
        <p>Sheet content</p>
      </Sheet>,
    );

    expect(screen.getByRole("dialog", { name: "Sample modal" })).toHaveAttribute(
      "aria-modal",
      "true",
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders uploaded background in LandscapeFocus while focusing and toggles cleanly", async () => {
    function LandscapeWrapper() {
      const f = useFocus();
      const pngFile = new File([new Uint8Array([137, 80, 78, 71])], "studio.png", {
        type: "image/png",
      });
      return (
        <div>
          <button type="button" onClick={() => void f.uploadCustomBackground(pngFile)}>
            UploadTestBg
          </button>
          <LandscapeFocus onExit={vi.fn()} />
        </div>
      );
    }

    render(
      <FocusProvider>
        <LandscapeWrapper />
      </FocusProvider>,
    );

    expect(screen.queryByTestId("landscape-custom-background")).not.toBeInTheDocument();

    await act(async () => {
      screen.getByText("UploadTestBg").click();
    });

    await waitFor(() => {
      expect(screen.getByTestId("landscape-custom-background")).toBeInTheDocument();
    });

    // Open Background overlay and close it with Escape
    fireEvent.click(screen.getByRole("button", { name: /Customize landscape background/i }));
    expect(screen.getByRole("dialog", { name: "Focus background" })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Focus background" })).not.toBeInTheDocument();
  });

  it("gives helpful feedback for duplicate custom times and disabled test notification button", async () => {
    render(
      <FocusProvider>
        <NotificationsScreen />
      </FocusProvider>,
    );

    const addBtn = screen.getByRole("button", { name: /Add time/i });
    await act(async () => {
      fireEvent.click(addBtn);
    });
    await act(async () => {
      fireEvent.click(addBtn);
    });

    expect(screen.getByText(/is already added/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Send test notification/i })).toBeDisabled();
    expect(
      screen.getByText(/Tap Enable Focus Notifications above first to send a test alert/i),
    ).toBeInTheDocument();
  });
});
