import { useCallback, useEffect, useRef, useState } from "react";
import { useFocus } from "./focus-store";
import { exitFullscreen, isFullscreenActive } from "./fullscreen";

function detectLandscape(): boolean {
  if (typeof window === "undefined") return false;
  const mq = window.matchMedia?.("(orientation: landscape)");
  if (mq) return mq.matches;
  return window.innerWidth > window.innerHeight;
}

function detectCompactOrTouchLandscape(): boolean {
  if (typeof window === "undefined") return false;
  if (!detectLandscape()) return false;
  const coarse = window.matchMedia?.("(pointer: coarse)")?.matches ?? false;
  return coarse || window.innerHeight <= 620;
}

export function useOrientationImmersive() {
  const { immersiveManual, setImmersiveManual } = useFocus();
  const [isLandscape, setIsLandscape] = useState(false);
  const [autoLandscape, setAutoLandscape] = useState(false);
  const dismissedRef = useRef(false);
  const prevLandscapeRef = useRef<boolean | null>(null);

  useEffect(() => {
    const sync = () => {
      const nextLandscape = detectLandscape();
      const prevLandscape = prevLandscapeRef.current;
      prevLandscapeRef.current = nextLandscape;
      setIsLandscape(nextLandscape);

      // Returning from landscape to portrait clears dismissal and restores portrait mode.
      if (!nextLandscape) {
        dismissedRef.current = false;
        setAutoLandscape(false);
        if (prevLandscape === true) {
          setImmersiveManual(false);
        }
        return;
      }

      // Entering landscape from portrait automatically transitions to immersive mode.
      if (prevLandscape === false) {
        dismissedRef.current = false;
        setAutoLandscape(true);
        return;
      }

      // Initial mount in mobile/compact landscape enters immersive mode automatically;
      // wide desktop windows stay in setup mode until rotated or triggered manually.
      if (prevLandscape === null && detectCompactOrTouchLandscape() && !dismissedRef.current) {
        setAutoLandscape(true);
      }
    };

    sync();
    const mq = window.matchMedia?.("(orientation: landscape)");
    const onChange = () => sync();

    mq?.addEventListener?.("change", onChange);
    window.addEventListener("resize", onChange);
    window.screen?.orientation?.addEventListener?.("change", onChange);

    return () => {
      mq?.removeEventListener?.("change", onChange);
      window.removeEventListener("resize", onChange);
      window.screen?.orientation?.removeEventListener?.("change", onChange);
    };
  }, [setImmersiveManual]);

  const enterImmersive = useCallback(() => {
    dismissedRef.current = false;
    setImmersiveManual(true);
  }, [setImmersiveManual]);

  const exitImmersive = useCallback(() => {
    dismissedRef.current = true;
    setAutoLandscape(false);
    setImmersiveManual(false);
    if (isFullscreenActive()) {
      void exitFullscreen();
    }
  }, [setImmersiveManual]);

  const isImmersive = immersiveManual || (isLandscape && autoLandscape && !dismissedRef.current);

  return {
    isLandscape,
    isImmersive,
    enterImmersive,
    exitImmersive,
  };
}
