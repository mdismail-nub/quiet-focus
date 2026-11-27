import { useState } from "react";
import {
  MASCOT_ASSETS,
  NOTIFICATION_COLORS,
  type NotificationCategory,
} from "@/lib/notifications-core";
import { cn } from "@/lib/utils";

const CATEGORY_ALT: Record<NotificationCategory, string> = {
  focus: "Focus ember companion concentrating calmly",
  motivation: "Focus companion waving warmly to encourage you",
  completion: "Focus companion celebrating a finished session",
  break: "Focus companion relaxing with a warm mug",
};

export function NotificationMascot({
  category,
  size = "md",
  className,
}: {
  category: NotificationCategory;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const [imgFailed, setImgFailed] = useState(false);

  const dims =
    size === "sm"
      ? "size-11 rounded-xl"
      : size === "lg"
        ? "size-20 rounded-2xl"
        : "size-14 rounded-2xl";

  if (imgFailed) {
    return (
      <span
        aria-label={CATEGORY_ALT[category]}
        className={cn(
          "inline-flex shrink-0 items-center justify-center overflow-hidden border border-black/10",
          dims,
          className,
        )}
        style={{ backgroundColor: NOTIFICATION_COLORS.offWhite }}
      >
        <svg viewBox="0 0 64 64" className="size-full p-2" aria-hidden="true">
          <circle cx="32" cy="34" r="20" fill={NOTIFICATION_COLORS.softPink} />
          <path
            d="M32 14c7 8 14 14 14 23a14 14 0 1 1-28 0c0-9 7-15 14-23Z"
            fill={NOTIFICATION_COLORS.warmOrange}
          />
          <circle cx="27" cy="36" r="2.2" fill={NOTIFICATION_COLORS.ink} />
          <circle cx="37" cy="36" r="2.2" fill={NOTIFICATION_COLORS.ink} />
          <path
            d="M28 42c2.5 2.5 5.5 2.5 8 0"
            fill="none"
            stroke={NOTIFICATION_COLORS.ink}
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        </svg>
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex shrink-0 overflow-hidden border border-black/8 shadow-xs",
        dims,
        className,
      )}
      style={{ backgroundColor: NOTIFICATION_COLORS.offWhite }}
    >
      <img
        src={MASCOT_ASSETS[category]}
        alt={CATEGORY_ALT[category]}
        loading="lazy"
        onError={() => setImgFailed(true)}
        className="size-full object-cover"
      />
    </span>
  );
}

const PREVIEW_COPY: Record<
  NotificationCategory,
  {
    title: string;
    body: string;
    actions: string[];
    timeLabel: string;
  }
> = {
  focus: {
    title: "Focusing: Deep work",
    body: "Time to focus! Your next 25 minutes start now.",
    actions: ["Open Timer", "Dismiss"],
    timeLabel: "now",
  },
  motivation: {
    title: "Focus Companion",
    body: "Hey! Your dreams deserve a little attention today.",
    actions: ["Start Focus", "Dismiss"],
    timeLabel: "9:00 AM",
  },
  completion: {
    title: "Your focus session is complete!",
    body: "Wonderful work! Another session completed.",
    actions: ["Open Summary", "Take Break"],
    timeLabel: "now",
  },
  break: {
    title: "Break time · 5m",
    body: "You've earned a little break. Stretch and relax.",
    actions: ["Start Focus", "Open Timer"],
    timeLabel: "now",
  },
};

export function NotificationPreviewCard({
  category,
  customBody,
  className,
}: {
  category: NotificationCategory;
  customBody?: string | undefined;
  className?: string;
}) {
  const copy = PREVIEW_COPY[category];

  return (
    <div
      className={cn("rounded-[22px] border p-4 shadow-xs transition-colors", className)}
      style={{
        backgroundColor: NOTIFICATION_COLORS.offWhite,
        borderColor: "rgba(255, 138, 61, 0.28)",
        color: NOTIFICATION_COLORS.ink,
      }}
    >
      <div className="flex items-center justify-between gap-2 text-[11px] font-medium opacity-75">
        <span className="flex items-center gap-1.5">
          <img src="/pwa-192x192.png" alt="" className="size-4 rounded-sm object-cover" />
          <span>Focus</span>
        </span>
        <span>{copy.timeLabel}</span>
      </div>

      <div className="mt-2.5 flex items-start gap-3">
        <NotificationMascot category={category} size="md" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-snug">{copy.title}</p>
          <p className="mt-0.5 text-xs leading-relaxed opacity-85">{customBody ?? copy.body}</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 border-t border-black/8 pt-2.5">
        {copy.actions.map((label, idx) => (
          <span
            key={label}
            className="inline-flex min-h-7 items-center rounded-full px-3 text-[11px] font-semibold"
            style={
              idx === 0
                ? {
                    backgroundColor: NOTIFICATION_COLORS.warmOrange,
                    color: "#FFFFFF",
                  }
                : {
                    backgroundColor: NOTIFICATION_COLORS.softPink,
                    color: NOTIFICATION_COLORS.ink,
                  }
            }
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
