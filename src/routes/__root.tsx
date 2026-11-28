import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { Component, useEffect, type ErrorInfo, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { formatUserErrorMessage, isDynamicImportError } from "../lib/firebase";
import { FocusProvider } from "../lib/focus-store";
import { SyncStatusBanner } from "../components/PWAControls";
import {
  isCapacitorNative,
  minimizeNativeApp,
  registerNativeAppLifecycle,
} from "../lib/capacitor-native";

const CHUNK_RELOAD_KEY = "focus.chunk_reload_at";

async function reloadAfterDynamicImportError(): Promise<void> {
  if (typeof window === "undefined") return;
  if (navigator.onLine !== false && typeof caches !== "undefined") {
    await caches.delete("pages-cache").catch(() => {});
  }
  try {
    window.location.reload();
  } catch {
    // Restricted environments may block programmatic reload
  }
}

function tryAutoRecoverDynamicImportError(): boolean {
  if (typeof window === "undefined" || navigator.onLine === false) return false;
  try {
    const last = Number(window.sessionStorage.getItem(CHUNK_RELOAD_KEY) || "0");
    const now = Date.now();
    if (now - last < 15_000) return false;
    window.sessionStorage.setItem(CHUNK_RELOAD_KEY, String(now));
    void reloadAfterDynamicImportError();
    return true;
  } catch {
    return false;
  }
}

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  const isChunkError = isDynamicImportError(error);
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
    if (isChunkError) {
      tryAutoRecoverDynamicImportError();
    }
  }, [error, isChunkError]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          {isChunkError ? "Updating app" : "This page didn't load"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {isChunkError
            ? formatUserErrorMessage(error)
            : "Something went wrong on our end. You can try refreshing or head back home."}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              if (isChunkError) {
                void reloadAfterDynamicImportError();
                return;
              }
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {isChunkError ? "Reload page" : "Try again"}
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "Focus — a quiet focus timer" },
      { name: "description", content: "A minimal timer to start focusing and get to work." },
      { name: "theme-color", content: "#f5f5f5" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "default" },
      { name: "apple-mobile-web-app-title", content: "Focus" },
      { name: "author", content: "Focus" },
      { property: "og:title", content: "Focus — a quiet focus timer" },
      { property: "og:description", content: "A minimal timer to start focusing and get to work." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

interface AppErrorBoundaryState {
  hasError: boolean;
  error: unknown;
}

export class AppErrorBoundary extends Component<{ children: ReactNode }, AppErrorBoundaryState> {
  override state: AppErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: unknown): AppErrorBoundaryState {
    return { hasError: true, error };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error("AppErrorBoundary caught error:", error, info.componentStack);
    reportLovableError(error, {
      boundary: "react_app_error_boundary",
      componentStack: info.componentStack,
    });
    if (isDynamicImportError(error)) {
      tryAutoRecoverDynamicImportError();
    }
  }

  override render() {
    if (this.state.hasError) {
      const isChunkError = isDynamicImportError(this.state.error);
      const message = formatUserErrorMessage(
        this.state.error,
        "Something unexpected happened. Your focus data remains saved on this device.",
      );
      return (
        <div className="flex min-h-screen items-center justify-center bg-background px-4">
          <div className="max-w-md text-center">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              {isChunkError ? "Updating app" : "Something went wrong"}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">{message}</p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (isChunkError) {
                    void reloadAfterDynamicImportError();
                    return;
                  }
                  this.setState({ hasError: false, error: null });
                }}
                className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                {isChunkError ? "Reload page" : "Try again"}
              </button>
              <a
                href="/"
                className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
              >
                Go home
              </a>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();

  useEffect(() => {
    if (!isCapacitorNative()) return;
    let unsub: (() => void) | undefined;
    void registerNativeAppLifecycle({
      onBackButton: ({ canGoBack }) => {
        if (window.location.pathname !== "/" && (canGoBack || window.history.length > 1)) {
          router.history.back();
        } else if (window.location.pathname !== "/") {
          void router.navigate({ to: "/" });
        } else {
          void minimizeNativeApp();
        }
      },
    }).then((fn) => {
      unsub = fn;
    });
    return () => {
      unsub?.();
    };
  }, [router]);

  useEffect(() => {
    if (isCapacitorNative() || !("serviceWorker" in navigator)) return;
    let active = true;
    import("virtual:pwa-register")
      .then(({ registerSW }) => {
        if (!active) return;
        registerSW({
          immediate: true,
          onRegisterError: () => {
            // Ignore service worker registration errors in unsupported/private environments.
          },
          onRegisteredSW: async () => {
            if (
              !import.meta.env.PROD ||
              navigator.onLine === false ||
              typeof caches === "undefined"
            ) {
              return;
            }
            try {
              const cache = await caches.open("pages-cache");
              await Promise.all(
                ["/", "/progress", "/leaderboard", "/social", "/notifications", "/settings"].map(
                  async (path) => {
                    const res = await fetch(path, { credentials: "same-origin" });
                    if (res.ok) await cache.put(path, res);
                  },
                ),
              );
            } catch {
              // Offline cache warm-up is best-effort.
            }
          },
        });
      })
      .catch(() => {
        // Ignore service worker registration errors in unsupported environments.
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AppErrorBoundary>
        {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
        <FocusProvider>
          <div className="mx-auto w-full max-w-xl px-5 sm:px-6">
            <SyncStatusBanner />
            <Outlet />
          </div>
        </FocusProvider>
      </AppErrorBoundary>
    </QueryClientProvider>
  );
}
