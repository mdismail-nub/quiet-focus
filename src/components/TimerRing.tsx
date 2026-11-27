export function TimerRing({ progress, size = 280, children }: { progress: number; size?: number; children: React.ReactNode }) {
  const r = 46;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative mx-auto" style={{ width: size, height: size, maxWidth: "78vw", maxHeight: "78vw" }}>
      <svg viewBox="0 0 100 100" className="size-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="var(--color-card)" stroke="var(--color-track)" strokeWidth="1.6" />
        <circle
          cx="50" cy="50" r={r} fill="none" stroke="var(--color-primary)" strokeWidth="1.6" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - progress)}
          style={{ transition: "stroke-dashoffset 300ms linear" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
}
