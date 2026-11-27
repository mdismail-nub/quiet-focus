type VendorDoc = Document & {
  webkitFullscreenEnabled?: boolean;
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};

type VendorEl = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

export function isFullscreenSupported(): boolean {
  if (typeof document === "undefined") return false;
  const doc = document as VendorDoc;
  const el = document.documentElement as VendorEl;
  const enabled = doc.fullscreenEnabled ?? doc.webkitFullscreenEnabled;
  if (enabled === false) return false;
  return (
    typeof el.requestFullscreen === "function" || typeof el.webkitRequestFullscreen === "function"
  );
}

export function isFullscreenActive(): boolean {
  if (typeof document === "undefined") return false;
  const doc = document as VendorDoc;
  return Boolean(doc.fullscreenElement ?? doc.webkitFullscreenElement);
}

export async function enterFullscreen(): Promise<boolean> {
  if (typeof document === "undefined") return false;
  const el = document.documentElement as VendorEl;
  try {
    if (typeof el.requestFullscreen === "function") {
      await el.requestFullscreen();
      return true;
    }
    if (typeof el.webkitRequestFullscreen === "function") {
      await el.webkitRequestFullscreen();
      return true;
    }
  } catch {
    // Mobile browsers or iframe permissions may reject fullscreen requests.
  }
  return false;
}

export async function exitFullscreen(): Promise<void> {
  if (typeof document === "undefined" || !isFullscreenActive()) return;
  const doc = document as VendorDoc;
  try {
    if (typeof doc.exitFullscreen === "function") {
      await doc.exitFullscreen();
    } else if (typeof doc.webkitExitFullscreen === "function") {
      await doc.webkitExitFullscreen();
    }
  } catch {
    // Ignore errors when exiting fullscreen.
  }
}

export async function toggleFullscreen(): Promise<boolean> {
  if (isFullscreenActive()) {
    await exitFullscreen();
    return false;
  }
  return enterFullscreen();
}

export function onFullscreenChange(cb: (active: boolean) => void): () => void {
  if (typeof document === "undefined") return () => {};
  const handler = () => cb(isFullscreenActive());
  document.addEventListener("fullscreenchange", handler);
  document.addEventListener("webkitfullscreenchange", handler);
  return () => {
    document.removeEventListener("fullscreenchange", handler);
    document.removeEventListener("webkitfullscreenchange", handler);
  };
}
