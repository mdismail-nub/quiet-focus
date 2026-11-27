import { useState } from "react";
import { Download, Share, WifiOff } from "lucide-react";
import { useOnlineStatus, usePWAInstall } from "@/lib/use-pwa";
import { PillButton, Sheet } from "@/components/ui-kit";

export function PWAInstallHeaderButton() {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled || (!isInstallable && !isIOS)) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (isInstallable) {
            void install();
          } else {
            setShowIOSGuide(true);
          }
        }}
        aria-label="Install app"
        title="Install Focus app"
        className="press flex min-h-11 min-w-11 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
      >
        <Download className="size-[18px]" strokeWidth={1.75} />
      </button>

      <IOSInstallSheet open={showIOSGuide} onClose={() => setShowIOSGuide(false)} />
    </>
  );
}

export function PWAInstallSettingsControl() {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return <span className="text-sm text-muted-foreground">Installed</span>;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => void install()}
        className="press flex min-h-10 items-center gap-1.5 rounded-full bg-ink px-4 text-sm font-medium text-ink-foreground"
      >
        <Download className="size-4" strokeWidth={1.75} />
        Install
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="press flex min-h-10 items-center gap-1.5 rounded-full border border-border bg-secondary px-4 text-sm font-medium text-foreground"
        >
          <Share className="size-3.5" strokeWidth={1.75} />
          Add to Home
        </button>
        <IOSInstallSheet open={showIOSGuide} onClose={() => setShowIOSGuide(false)} />
      </>
    );
  }

  return <span className="text-xs text-muted-foreground">Use browser install menu</span>;
}

function IOSInstallSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose}>
      <h2 className="text-xl font-semibold">Install Focus on iOS</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Install Focus to your Home Screen for full-screen launch and offline timer access.
      </p>
      <ol className="mt-4 space-y-2.5 text-sm text-foreground">
        <li>
          1. Tap the <span className="font-semibold">Share</span> button in Safari&apos;s toolbar.
        </li>
        <li>
          2. Scroll down and tap <span className="font-semibold">Add to Home Screen</span>.
        </li>
        <li>
          3. Tap <span className="font-semibold">Add</span> to finish installing.
        </li>
      </ol>
      <div className="mt-6">
        <PillButton onClick={onClose}>Got it</PillButton>
      </div>
    </Sheet>
  );
}

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed top-3 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-card/95 px-3.5 py-1.5 text-xs font-medium text-foreground shadow-sm backdrop-blur-md"
    >
      <WifiOff className="size-3.5 text-primary" strokeWidth={2} />
      <span>Offline mode</span>
    </div>
  );
}
