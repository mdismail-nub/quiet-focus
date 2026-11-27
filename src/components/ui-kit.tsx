import { Link } from "@tanstack/react-router";
import { Settings as Gear, Timer, BarChart3, ChevronLeft } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Logo() {
  return (
    <span className="flex items-center gap-2">
      <svg viewBox="0 0 24 24" className="size-6" aria-hidden>
        <circle cx="12" cy="12" r="10" fill="none" stroke="var(--color-muted-foreground)" strokeOpacity=".3" strokeWidth="2.5" />
        <path d="M12 2a10 10 0 0 1 10 10" fill="none" stroke="var(--color-primary)" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
      <span className="text-[15px] font-semibold tracking-tight">Focus</span>
    </span>
  );
}

export function Header({ back }: { back?: boolean }) {
  return (
    <header className="flex items-center justify-between py-4">
      {back ? (
        <Link to="/" className="press -ml-2 flex items-center gap-1 rounded-full p-2 text-sm text-muted-foreground"><ChevronLeft className="size-5" />Back</Link>
      ) : <Logo />}
      {!back && (
        <Link to="/settings" aria-label="Settings" className="press -mr-2 rounded-full p-2 text-muted-foreground hover:text-foreground">
          <Gear className="size-5" strokeWidth={1.75} />
        </Link>
      )}
    </header>
  );
}

export function PillButton({ variant = "primary", className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "outline" | "danger" }) {
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
  return <div className={cn("rounded-[22px] border border-border bg-card p-5", className)}>{children}</div>;
}

export function BottomNav() {
  const item = "press flex flex-1 flex-col items-center gap-1 rounded-full py-2 text-xs font-medium text-muted-foreground";
  return (
    <nav className="sticky bottom-4 mx-auto mt-6 flex w-56 gap-1 rounded-full border border-border bg-card p-1.5">
      <Link to="/" className={item} activeProps={{ className: "bg-secondary !text-foreground" }} activeOptions={{ exact: true }}>
        <Timer className="size-5" strokeWidth={1.75} />Focus
      </Link>
      <Link to="/progress" className={item} activeProps={{ className: "bg-secondary !text-foreground" }}>
        <BarChart3 className="size-5" strokeWidth={1.75} />Progress
      </Link>
    </nav>
  );
}

export function Sheet({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/30 sm:items-center" onClick={onClose}>
      <div role="dialog" className="screen-in w-full max-w-md rounded-t-[28px] bg-card p-6 pb-8 sm:rounded-[28px]" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
