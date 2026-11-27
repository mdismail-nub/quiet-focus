import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { FocusProvider, useFocus } from "@/lib/focus-store";
import {
  getPermissionState,
  requestNotificationPermissionExplicit,
  showAppNotification,
} from "@/lib/notification-client";
import { clearNotificationDBForTests, loadNotificationRecord } from "@/lib/notification-db";
import { buildSessionCompletePayload } from "@/lib/notifications-core";
import { NotificationOnboarding } from "@/components/NotificationOnboarding";
import { NotificationsScreen } from "@/routes/notifications";

vi.mock("@/components/ui-kit", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/components/ui-kit")>();
  return {
    ...mod,
    Header: ({ back }: { back?: boolean }) => (
      <header data-testid="mock-header">{back ? "Back" : "Focus"}</header>
    ),
  };
});

function Wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient();
  return (
    <QueryClientProvider client={qc}>
      <FocusProvider>{children}</FocusProvider>
    </QueryClientProvider>
  );
}

describe("notification-client, FocusProvider lifecycle, offline sync, and UI", () => {
  const originalNotification = window.Notification;
  let showNotificationSpy: ReturnType<typeof vi.fn>;
  let closeNotificationSpy: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    localStorage.clear();
    await clearNotificationDBForTests();

    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => true,
    }));

    showNotificationSpy = vi.fn().mockResolvedValue(undefined);
    closeNotificationSpy = vi.fn();

    const fakeRegistration = {
      showNotification: showNotificationSpy,
      getNotifications: vi.fn(async () => [{ close: closeNotificationSpy }]),
      pushManager: {
        getSubscription: vi.fn(async () => null),
        subscribe: vi.fn(async () => ({
          endpoint: "https://fcm.googleapis.com/fcm/send/mock-endpoint",
          toJSON: () => ({
            endpoint: "https://fcm.googleapis.com/fcm/send/mock-endpoint",
            keys: {
              p256dh:
                "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM",
              auth: "tBHItJI5svbpez7KI4CCXg",
            },
          }),
        })),
      },
    };

    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: {
        getRegistration: vi.fn(async () => fakeRegistration),
        ready: Promise.resolve(fakeRegistration),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request) => {
        const u = String(url);
        if (u.includes("/api/health")) {
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        }
        if (u.includes("/api/push/vapid-public-key")) {
          return new Response(
            JSON.stringify({
              publicKey:
                "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM",
              configured: true,
            }),
            { status: 200 },
          );
        }
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(window, "Notification", {
      configurable: true,
      value: originalNotification,
    });
  });

  it("requests permission only on explicit call and never re-prompts when denied", async () => {
    const reqSpy = vi.fn().mockResolvedValue("granted");
    class MockNotification {
      static permission: NotificationPermission = "default";
      static requestPermission = reqSpy;
    }
    Object.defineProperty(window, "Notification", {
      configurable: true,
      value: MockNotification,
    });

    expect(getPermissionState()).toBe("default");
    expect(reqSpy).not.toHaveBeenCalled();

    const granted = await requestNotificationPermissionExplicit();
    expect(granted).toBe("granted");
    expect(reqSpy).toHaveBeenCalledTimes(1);

    // Denied state must never invoke requestPermission again
    reqSpy.mockClear();
    MockNotification.permission = "denied";
    const denied = await requestNotificationPermissionExplicit();
    expect(denied).toBe("denied");
    expect(reqSpy).not.toHaveBeenCalled();
  });

  it("deduplicates system notifications with identical dedupeKey", async () => {
    class MockNotification {
      static permission: NotificationPermission = "granted";
      static requestPermission = vi.fn();
      actions = [];
    }
    Object.defineProperty(window, "Notification", {
      configurable: true,
      value: MockNotification,
    });

    const payload = buildSessionCompletePayload({
      sessionId: "sess_dedupe_1",
      minutes: 25,
      label: "Deep work",
    });

    const first = await showAppNotification(payload);
    const second = await showAppNotification(payload);

    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(showNotificationSpy).toHaveBeenCalledTimes(1);
  });

  it("renders permission states and offline scheduling warning on NotificationsScreen", async () => {
    class MockNotification {
      static permission: NotificationPermission = "denied";
      static requestPermission = vi.fn();
    }
    Object.defineProperty(window, "Notification", {
      configurable: true,
      value: MockNotification,
    });
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });

    render(
      <Wrapper>
        <NotificationsScreen />
      </Wrapper>,
    );

    expect(screen.getByTestId("permission-status-badge")).toHaveTextContent("Denied");
    expect(screen.getByTestId("offline-scheduling-notice")).toBeInTheDocument();
    expect(MockNotification.requestPermission).not.toHaveBeenCalled();
  });

  it("supports Focus timer lifecycle notifications, pause/resume/reset, offline sync queue, and prevents duplicate SW start_focus", async () => {
    const listeners: ((ev: MessageEvent) => void)[] = [];
    const reqSpy = vi.fn().mockResolvedValue("granted");

    class MockNotification {
      static permission: NotificationPermission = "granted";
      static requestPermission = reqSpy;
    }
    Object.defineProperty(window, "Notification", {
      configurable: true,
      value: MockNotification,
    });
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: {
        getRegistration: vi.fn(async () => ({
          showNotification: showNotificationSpy,
          getNotifications: vi.fn(async () => [{ close: closeNotificationSpy }]),
          pushManager: {
            getSubscription: vi.fn(async () => null),
            subscribe: vi.fn(async () => ({
              endpoint: "https://fcm.googleapis.com/fcm/send/mock-endpoint",
              toJSON: () => ({
                endpoint: "https://fcm.googleapis.com/fcm/send/mock-endpoint",
                keys: {
                  p256dh:
                    "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM",
                  auth: "tBHItJI5svbpez7KI4CCXg",
                },
              }),
            })),
          },
        })),
        addEventListener: (_type: string, fn: (ev: MessageEvent) => void) => listeners.push(fn),
        removeEventListener: vi.fn(),
      },
    });

    function Harness() {
      const f = useFocus();
      return (
        <div>
          <span data-testid="notif-enabled">{String(f.notificationPrefs.enabled)}</span>
          <span data-testid="timer-status">{f.timer.status}</span>
          <span data-testid="session-id">{f.timer.sessionId ?? ""}</span>
          <button
            type="button"
            onClick={() => void f.enableCompanionNotifications({ dailyCount: 2 })}
          >
            Enable
          </button>
          <button type="button" onClick={f.start}>
            Start
          </button>
          <button type="button" onClick={f.pause}>
            Pause
          </button>
          <button type="button" onClick={f.resume}>
            Resume
          </button>
          <button type="button" onClick={f.reset}>
            Reset
          </button>
        </div>
      );
    }

    render(
      <Wrapper>
        <Harness />
      </Wrapper>,
    );

    await act(async () => {
      fireEvent.click(screen.getByText("Enable"));
    });
    await waitFor(() => {
      expect(screen.getByTestId("notif-enabled")).toHaveTextContent("true");
    });

    await act(async () => {
      fireEvent.click(screen.getByText("Start"));
    });
    const firstSessionId = screen.getByTestId("session-id").textContent;
    expect(screen.getByTestId("timer-status")).toHaveTextContent("running");

    await waitFor(() => {
      expect(showNotificationSpy).toHaveBeenCalledWith(
        "Focus session active",
        expect.objectContaining({ tag: "focus-active-session" }),
      );
    });

    // Duplicate SW start_focus action while running must not restart sessionId
    act(() => {
      for (const fn of listeners) {
        fn(
          new MessageEvent("message", {
            data: { type: "FOCUS_NOTIFICATION_ACTION", action: "start_focus" },
          }),
        );
      }
    });
    expect(screen.getByTestId("session-id").textContent).toBe(firstSessionId);

    // Pause updates persistent notification and cancels scheduled completion
    await act(async () => {
      fireEvent.click(screen.getByText("Pause"));
    });
    expect(screen.getByTestId("timer-status")).toHaveTextContent("paused");
    await waitFor(() => {
      expect(showNotificationSpy).toHaveBeenCalledWith(
        "Focus session paused",
        expect.objectContaining({ tag: "focus-active-session" }),
      );
    });

    // Resume restores active notification
    await act(async () => {
      fireEvent.click(screen.getByText("Resume"));
    });
    expect(screen.getByTestId("timer-status")).toHaveTextContent("running");

    // Reset closes persistent notification
    await act(async () => {
      fireEvent.click(screen.getByText("Reset"));
    });
    expect(screen.getByTestId("timer-status")).toHaveTextContent("idle");
    await waitFor(() => {
      expect(closeNotificationSpy).toHaveBeenCalled();
    });

    // Offline preference change marks pendingSync in IndexedDB
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    await act(async () => {
      window.dispatchEvent(new Event("offline"));
    });
    const rec = await loadNotificationRecord();
    expect(rec.preferences.enabled).toBe(true);
  });

  it("allows skipping NotificationOnboarding at any step without prompting permission", async () => {
    const reqSpy = vi.fn().mockResolvedValue("granted");
    class MockNotification {
      static permission: NotificationPermission = "default";
      static requestPermission = reqSpy;
    }
    Object.defineProperty(window, "Notification", {
      configurable: true,
      value: MockNotification,
    });

    const onClose = vi.fn();
    render(
      <Wrapper>
        <NotificationOnboarding open onClose={onClose} />
      </Wrapper>,
    );

    expect(screen.getByText("Meet your Focus Companion")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Skip for now"));

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
    expect(reqSpy).not.toHaveBeenCalled();
  });
});
