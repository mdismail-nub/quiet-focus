import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FocusProvider, useFocus } from "@/lib/focus-store";
import { useOrientationImmersive } from "@/lib/use-orientation";
import { LandscapeFocus } from "@/components/LandscapeFocus";
import { isFullscreenSupported } from "@/lib/fullscreen";

function createMatchMedia(initialLandscape: boolean) {
  let landscape = initialLandscape;
  const listeners = new Set<() => void>();

  const mock = (query: string) => ({
    get matches() {
      if (query.includes("orientation: landscape")) return landscape;
      return false;
    },
    media: query,
    onchange: null,
    addListener: (cb: () => void) => listeners.add(cb),
    removeListener: (cb: () => void) => listeners.delete(cb),
    addEventListener: (_: string, cb: () => void) => listeners.add(cb),
    removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
    dispatchEvent: () => true,
  });

  return {
    mock,
    setLandscape: (next: boolean) => {
      landscape = next;
      listeners.forEach((cb) => cb());
    },
  };
}

function Harness() {
  const f = useFocus();
  const { isImmersive, exitImmersive } = useOrientationImmersive();

  if (isImmersive) {
    return <LandscapeFocus onExit={exitImmersive} />;
  }

  return (
    <div>
      <span data-testid="portrait-status">{f.timer.status}</span>
      <span data-testid="portrait-label">{f.timer.label}</span>
      <input aria-label="Task" value={f.timer.label} onChange={(e) => f.setLabel(e.target.value)} />
      <button onClick={() => f.selectMinutes(50)}>50m</button>
      <button onClick={f.start}>Start</button>
      <button onClick={() => f.setSettings({ landscapeTheme: "forest" })}>Forest</button>
    </div>
  );
}

describe("Orientation & Immersive Landscape Mode", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("transitions to landscape on orientation change while preserving running timer and task label", () => {
    const mm = createMatchMedia(false);
    vi.stubGlobal("matchMedia", mm.mock);

    const { container } = render(
      <FocusProvider>
        <Harness />
      </FocusProvider>,
    );

    fireEvent.change(screen.getByLabelText("Task"), {
      target: { value: "Write architecture doc" },
    });
    fireEvent.click(screen.getByText("50m"));
    fireEvent.click(screen.getByText("Start"));
    fireEvent.click(screen.getByText("Forest"));

    expect(screen.getByTestId("portrait-status")).toHaveTextContent("running");

    // Simulate device rotating to landscape
    act(() => {
      mm.setLandscape(true);
    });

    // Landscape mode renders task label, Pause button, and Forest theme without resetting timer
    expect(screen.getByText("Write architecture doc")).toBeInTheDocument();
    expect(screen.getByText("50 min")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
    expect(container.querySelector(".landscape-forest")).not.toBeNull();

    // Pause in landscape, rotate back to portrait — paused state and label survive
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    act(() => {
      mm.setLandscape(false);
    });

    expect(screen.getByTestId("portrait-status")).toHaveTextContent("paused");
    expect(screen.getByTestId("portrait-label")).toHaveTextContent("Write architecture doc");
  });

  it("handles unavailable Fullscreen API gracefully", () => {
    Object.defineProperty(document, "fullscreenEnabled", { configurable: true, value: false });
    expect(isFullscreenSupported()).toBe(false);
  });
});
