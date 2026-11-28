import { useRef } from "react";
import { Image as ImageIcon, Trash2, Upload } from "lucide-react";
import { clampBackgroundDim } from "@/lib/custom-background-db";
import { useFocus } from "@/lib/focus-store";
import { cn } from "@/lib/utils";

export function CustomBackgroundControls({
  compact = false,
  onUploaded,
}: {
  compact?: boolean;
  onUploaded?: () => void;
}) {
  const f = useFocus();
  const s = f.settings;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const hasImage = Boolean(f.customBackgroundUrl);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const ok = await f.uploadCustomBackground(file);
    if (ok && onUploaded) {
      onUploaded();
    }
  };

  return (
    <div className="space-y-4">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        aria-label="Upload custom focus background image"
        onChange={(e) => void handleFileChange(e)}
        className="sr-only"
      />

      {hasImage && f.customBackgroundUrl ? (
        <div className="overflow-hidden rounded-2xl border border-border bg-secondary/40">
          <div className={cn("relative w-full overflow-hidden", compact ? "h-28" : "h-36")}>
            <img
              src={f.customBackgroundUrl}
              alt={s.customBackgroundName || "Custom focus background"}
              className="size-full object-cover"
            />
            <div
              className="absolute inset-0"
              style={{
                backgroundColor: `rgba(12, 13, 18, ${clampBackgroundDim(s.customBackgroundDim)})`,
              }}
            />
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
              <span className="text-[10px] font-semibold tracking-[0.18em] uppercase text-white/75">
                {s.customBackgroundEnabled ? "Active while focusing" : "Saved preview"}
              </span>
              <span className="mt-1 text-2xl font-bold tracking-tight tabular-nums">25:00</span>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 px-3 py-2.5 text-xs">
            <span className="min-w-0 truncate font-medium text-foreground">
              {s.customBackgroundName || "Custom background"}
            </span>
            <button
              type="button"
              onClick={() => void f.clearCustomBackground()}
              disabled={f.customBackgroundBusy}
              className="press inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-coral hover:bg-coral/10 disabled:opacity-40"
            >
              <Trash2 className="size-3.5" />
              Remove
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={f.customBackgroundBusy}
          className="press flex w-full flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-secondary/40 px-4 py-6 text-center transition-colors hover:bg-secondary/70 disabled:opacity-50"
        >
          <span className="flex size-10 items-center justify-center rounded-full bg-primary-soft text-primary">
            <ImageIcon className="size-5" strokeWidth={1.75} />
          </span>
          <span className="mt-2.5 text-sm font-semibold text-foreground">
            {f.customBackgroundBusy ? "Processing image..." : "Upload focus background"}
          </span>
          <span className="mt-0.5 text-xs text-muted-foreground">
            PNG, JPG, WebP or GIF · stored offline on your device
          </span>
        </button>
      )}

      {f.customBackgroundError && (
        <p role="alert" className="rounded-xl bg-coral/12 px-3 py-2 text-xs font-medium text-coral">
          {f.customBackgroundError}
        </p>
      )}

      {hasImage && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={f.customBackgroundBusy}
              className="press inline-flex min-h-10 items-center gap-1.5 rounded-full border border-border bg-card px-3.5 text-xs font-semibold text-foreground hover:bg-secondary disabled:opacity-40"
            >
              <Upload className="size-3.5" />
              {f.customBackgroundBusy ? "Updating..." : "Change image"}
            </button>

            <button
              type="button"
              role="switch"
              aria-checked={s.customBackgroundEnabled}
              aria-label="Use custom background"
              onClick={() => f.setSettings({ customBackgroundEnabled: !s.customBackgroundEnabled })}
              className={cn(
                "press inline-flex min-h-10 items-center gap-2 rounded-full border px-3.5 text-xs font-semibold transition-colors",
                s.customBackgroundEnabled
                  ? "border-primary bg-primary-soft text-foreground"
                  : "border-border bg-secondary/50 text-muted-foreground hover:text-foreground",
              )}
            >
              <span
                className={cn(
                  "size-2 rounded-full",
                  s.customBackgroundEnabled ? "bg-primary" : "bg-muted-foreground/50",
                )}
              />
              {s.customBackgroundEnabled ? "Using while focusing" : "Disabled"}
            </button>
          </div>

          <div>
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-muted-foreground">Overlay darkness</span>
              <span className="font-semibold tabular-nums text-foreground">
                {Math.round(clampBackgroundDim(s.customBackgroundDim) * 100)}%
              </span>
            </div>
            <input
              type="range"
              aria-label="Background overlay darkness"
              min={0.15}
              max={0.75}
              step={0.05}
              value={clampBackgroundDim(s.customBackgroundDim)}
              onChange={(e) =>
                f.setSettings({ customBackgroundDim: clampBackgroundDim(Number(e.target.value)) })
              }
              className="mt-1.5 h-2 w-full cursor-pointer accent-primary"
            />
          </div>
        </div>
      )}
    </div>
  );
}
