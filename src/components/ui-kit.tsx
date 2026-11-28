import { Link } from "@tanstack/react-router";
import {
  Settings as Gear,
  Timer,
  BarChart3,
  Trophy,
  Users,
  ChevronLeft,
  Maximize2,
  Cloud,
  CloudOff,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { PWAInstallHeaderButton } from "@/components/PWAControls";
import { AVATAR_OPTIONS, type AvatarId, type SyncStatus } from "@/lib/gamification";

export function Logo({ contrastOverBg }: { contrastOverBg?: boolean | undefined }) {
  return (
    <span className={cn("flex items-center gap-2", contrastOverBg && "text-white drop-shadow-xs")}>
      <svg viewBox="0 0 24 24" className="size-6" aria-hidden>
        <circle
          cx="12"
          cy="12"
          r="10"
          fill="none"
          stroke={contrastOverBg ? "rgba(255,255,255,0.45)" : "var(--color-muted-foreground)"}
          strokeOpacity={contrastOverBg ? 1 : 0.3}
          strokeWidth="2.5"
        />
        <path
          d="M12 2a10 10 0 0 1 10 10"
          fill="none"
          stroke="var(--color-primary)"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>
      <span className="text-[15px] font-semibold tracking-tight">Focus</span>
    </span>
  );
}

export function Header({
  back,
  onImmersive,
  contrastOverBg,
}: {
  back?: boolean;
  onImmersive?: () => void;
  contrastOverBg?: boolean;
}) {
  return (
    <header className="flex items-center justify-between py-4">
      {back ? (
        <Link
          to="/"
          className={cn(
            "press -ml-2 flex min-h-11 items-center gap-1 rounded-full px-2 text-sm",
            contrastOverBg ? "text-white/80 hover:text-white" : "text-muted-foreground",
          )}
        >
          <ChevronLeft className="size-5" />
          Back
        </Link>
      ) : (
        <Logo contrastOverBg={contrastOverBg} />
      )}
      {!back && (
        <div className="-mr-2 flex items-center gap-1">
          <PWAInstallHeaderButton />
          {onImmersive && (
            <button
              type="button"
              onClick={onImmersive}
              aria-label="Enter landscape focus mode"
              title="Immersive landscape mode"
              className={cn(
                "press flex min-h-11 min-w-11 items-center justify-center rounded-full transition-colors",
                contrastOverBg
                  ? "text-white/80 hover:bg-white/10 hover:text-white"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Maximize2 className="size-[18px]" strokeWidth={1.75} />
            </button>
          )}
          <Link
            to="/settings"
            aria-label="Settings"
            className={cn(
              "press flex min-h-11 min-w-11 items-center justify-center rounded-full transition-colors",
              contrastOverBg
                ? "text-white/80 hover:bg-white/10 hover:text-white"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Gear className="size-5" strokeWidth={1.75} />
          </Link>
        </div>
      )}
    </header>
  );
}

export function PillButton({
  variant = "primary",
  className,
  ...p
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "outline" | "danger";
}) {
  return (
    <button
      {...p}
      className={cn(
        "press h-14 w-full rounded-full text-[15px] font-semibold transition-colors disabled:opacity-40",
        variant === "primary" && "bg-ink text-ink-foreground",
        variant === "outline" && "border border-border bg-card text-foreground",
        variant === "ghost" && "h-11 text-muted-foreground hover:text-foreground",
        variant === "danger" && "bg-coral text-primary-foreground",
        className,
      )}
    />
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("rounded-[22px] border border-border bg-card p-5", className)}>
      {children}
    </div>
  );
}

export function BottomNav() {
  const item =
    "press flex flex-1 flex-col items-center gap-1 rounded-full py-2 text-[11px] font-medium text-muted-foreground transition-colors";
  return (
    <nav
      aria-label="Primary navigation"
      className="sticky bottom-4 z-20 mx-auto mt-6 flex w-full max-w-sm gap-1 rounded-full border border-border bg-card/95 p-1.5 shadow-sm backdrop-blur-md"
    >
      <Link
        to="/"
        className={item}
        activeProps={{ className: "bg-secondary !text-foreground" }}
        activeOptions={{ exact: true }}
      >
        <Timer className="size-[18px]" strokeWidth={1.75} />
        Focus
      </Link>
      <Link
        to="/progress"
        className={item}
        activeProps={{ className: "bg-secondary !text-foreground" }}
      >
        <BarChart3 className="size-[18px]" strokeWidth={1.75} />
        Progress
      </Link>
      <Link
        to="/leaderboard"
        className={item}
        activeProps={{ className: "bg-secondary !text-foreground" }}
      >
        <Trophy className="size-[18px]" strokeWidth={1.75} />
        Ranks
      </Link>
      <Link
        to="/social"
        className={item}
        activeProps={{ className: "bg-secondary !text-foreground" }}
      >
        <Users className="size-[18px]" strokeWidth={1.75} />
        Social
      </Link>
    </nav>
  );
}

export function Sheet({
  open,
  onClose,
  ariaLabel,
  children,
}: {
  open: boolean;
  onClose: () => void;
  ariaLabel?: string;
  children: ReactNode;
}) {
  const pointerDownOnBackdropRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/35 backdrop-blur-[2px] sm:items-center"
      onPointerDown={(e) => {
        pointerDownOnBackdropRef.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (pointerDownOnBackdropRef.current && e.target === e.currentTarget) {
          onClose();
        }
        pointerDownOnBackdropRef.current = false;
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        className="screen-in max-h-[88dvh] w-full max-w-md overflow-y-auto rounded-t-[28px] bg-card p-6 pb-8 text-foreground shadow-xl sm:rounded-[28px]"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

export function AvatarBadge({
  username,
  avatarId,
  size = "md",
}: {
  username: string;
  avatarId: AvatarId;
  size?: "sm" | "md" | "lg";
}) {
  const palette = AVATAR_OPTIONS.find((a) => a.id === avatarId) ?? AVATAR_OPTIONS[0]!;
  const initial = (username.trim()[0] ?? "F").toUpperCase();
  const dims =
    size === "sm" ? "size-8 text-xs" : size === "lg" ? "size-14 text-lg" : "size-10 text-sm";

  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold select-none",
        dims,
      )}
      style={{ backgroundColor: palette.bg, color: palette.fg }}
    >
      {initial}
    </span>
  );
}

export function SyncStatusChip({
  status,
  pendingCount,
}: {
  status: SyncStatus;
  pendingCount: number;
}) {
  const config: Record<SyncStatus, { label: string; icon: ReactNode; tone: string }> = {
    offline: {
      label: pendingCount > 0 ? `Offline · ${pendingCount} queued` : "Offline",
      icon: <CloudOff className="size-3.5 text-primary" strokeWidth={2} />,
      tone: "border-primary/30 bg-primary-soft text-foreground",
    },
    waiting: {
      label: `Waiting to sync (${pendingCount})`,
      icon: <Cloud className="size-3.5 text-primary" strokeWidth={2} />,
      tone: "border-border bg-secondary text-foreground",
    },
    syncing: {
      label: "Synchronizing…",
      icon: <RefreshCw className="size-3.5 animate-spin text-primary" strokeWidth={2} />,
      tone: "border-primary/30 bg-primary-soft text-foreground",
    },
    synced: {
      label: "Sync completed",
      icon: <CheckCircle2 className="size-3.5 text-primary" strokeWidth={2} />,
      tone: "border-border bg-card text-muted-foreground",
    },
    failed: {
      label: "Synchronization failed",
      icon: <AlertCircle className="size-3.5 text-coral" strokeWidth={2} />,
      tone: "border-coral/30 bg-coral/10 text-foreground",
    },
  };

  const c = config[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
        c.tone,
      )}
    >
      {c.icon}
      <span>{c.label}</span>
    </span>
  );
}
