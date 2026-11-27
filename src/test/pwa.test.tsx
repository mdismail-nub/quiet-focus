import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OfflineIndicator, PWAInstallHeaderButton } from "@/components/PWAControls";

describe("PWA controls and offline indicator", () => {
  beforeEach(() => {
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
  });

  it("shows offline indicator when offline and hides when back online", () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    render(<OfflineIndicator />);

    expect(screen.getByText("Offline mode")).toBeInTheDocument();

    act(() => {
      Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
      window.dispatchEvent(new Event("online"));
    });

    expect(screen.queryByText("Offline mode")).not.toBeInTheDocument();
  });

  it("exposes install button on beforeinstallprompt and triggers prompt on click", async () => {
    render(<PWAInstallHeaderButton />);

    expect(screen.queryByRole("button", { name: "Install app" })).not.toBeInTheDocument();

    const promptSpy = vi.fn().mockResolvedValue(undefined);
    const installEvent = new Event("beforeinstallprompt") as Event & {
      prompt: () => Promise<void>;
      userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
    };
    installEvent.prompt = promptSpy;
    installEvent.userChoice = Promise.resolve({ outcome: "accepted", platform: "web" });

    act(() => {
      window.dispatchEvent(installEvent);
    });

    const btn = screen.getByRole("button", { name: "Install app" });
    expect(btn).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(btn);
    });

    expect(promptSpy).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Install app" })).not.toBeInTheDocument();
  });
});
