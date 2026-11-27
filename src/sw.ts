/// <reference lib="webworker" />

import type { WorkboxPlugin } from "workbox-core";
import { CacheableResponsePlugin } from "workbox-cacheable-response";
import { clientsClaim } from "workbox-core";
import { ExpirationPlugin } from "workbox-expiration";
import { cleanupOutdatedCaches, precacheAndRoute } from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { CacheFirst, NetworkFirst } from "workbox-strategies";
import { hasDeliveredNotification, markNotificationDelivered } from "./lib/notification-db";
import type { CompanionNotificationPayload } from "./lib/notifications-core";

function wbPlugins(...plugins: unknown[]): WorkboxPlugin[] {
  return plugins as WorkboxPlugin[];
}

declare let self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

self.skipWaiting();
clientsClaim();
cleanupOutdatedCaches();

precacheAndRoute(self.__WB_MANIFEST ?? []);

registerRoute(
  ({ request }) => request.mode === "navigate",
  new NetworkFirst({
    cacheName: "pages-cache",
    networkTimeoutSeconds: 3,
    plugins: wbPlugins(
      new ExpirationPlugin({
        maxEntries: 20,
        maxAgeSeconds: 60 * 60 * 24 * 30,
      }),
      new CacheableResponsePlugin({
        statuses: [0, 200],
      }),
    ),
  }),
  "GET",
);

registerRoute(
  ({ url }) => url.pathname.startsWith("/assets/") || url.pathname.startsWith("/mascots/"),
  new CacheFirst({
    cacheName: "app-assets-cache",
    plugins: wbPlugins(
      new ExpirationPlugin({
        maxEntries: 80,
        maxAgeSeconds: 60 * 60 * 24 * 365,
      }),
      new CacheableResponsePlugin({
        statuses: [0, 200],
      }),
    ),
  }),
  "GET",
);

registerRoute(
  /^https:\/\/fonts\.googleapis\.com\/.*/i,
  new CacheFirst({
    cacheName: "google-fonts-cache",
    plugins: wbPlugins(
      new ExpirationPlugin({
        maxEntries: 10,
        maxAgeSeconds: 60 * 60 * 24 * 365,
      }),
      new CacheableResponsePlugin({
        statuses: [0, 200],
      }),
    ),
  }),
  "GET",
);

registerRoute(
  /^https:\/\/fonts\.gstatic\.com\/.*/i,
  new CacheFirst({
    cacheName: "gstatic-fonts-cache",
    plugins: wbPlugins(
      new ExpirationPlugin({
        maxEntries: 10,
        maxAgeSeconds: 60 * 60 * 24 * 365,
      }),
      new CacheableResponsePlugin({
        statuses: [0, 200],
      }),
    ),
  }),
  "GET",
);

self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      let payload: CompanionNotificationPayload = {
        category: "motivation",
        title: "Focus Companion",
        body: "Ready for a calm focus session?",
        tag: `focus-push-${Date.now()}`,
        url: "/?action=open_timer",
        icon: "/pwa-192x192.png",
        badge: "/pwa-192x192.png",
        image: "/mascots/motivation.jpg",
      };

      try {
        const parsed = event.data?.json() as Partial<CompanionNotificationPayload> | undefined;
        if (parsed && typeof parsed.title === "string" && typeof parsed.body === "string") {
          payload = { ...payload, ...parsed };
        }
      } catch {
        const text = event.data?.text();
        if (text) payload.body = text.slice(0, 160);
      }

      if (payload.dedupeKey) {
        const already = await hasDeliveredNotification(payload.dedupeKey);
        if (already) return;
        await markNotificationDelivered(payload.dedupeKey, payload.category);
      }

      // Close persistent active session notification when completion/break notification arrives
      if (payload.category === "completion" || payload.category === "break") {
        try {
          const active = await self.registration.getNotifications({ tag: "focus-active-session" });
          for (const n of active) n.close();
        } catch {
          // Ignore
        }
      }

      const actionsSupported =
        typeof Notification !== "undefined" && "actions" in Notification.prototype;

      const options: NotificationOptions & {
        image?: string;
        renotify?: boolean;
        actions?: { action: string; title: string }[];
      } = {
        body: payload.body,
        icon: payload.icon || "/pwa-192x192.png",
        badge: payload.badge || "/pwa-192x192.png",
        image: payload.image || "/mascots/motivation.jpg",
        tag: payload.tag || "focus-companion",
        requireInteraction: Boolean(payload.requireInteraction),
        renotify: Boolean(payload.renotify),
        silent: Boolean(payload.silent),
        data: {
          url: payload.url || "/",
          category: payload.category,
          sessionId: payload.sessionId,
          kind: payload.kind,
          minutes: payload.minutes,
        },
        ...(actionsSupported && Array.isArray(payload.actions)
          ? { actions: payload.actions.slice(0, 2) }
          : {}),
      };

      await self.registration.showNotification(payload.title, options);
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const action = event.action || "open_timer";
  if (action === "dismiss") {
    return;
  }

  const data = (event.notification.data ?? {}) as {
    url?: string;
    category?: string;
    sessionId?: string;
  };

  let targetPath = data.url || "/";
  if (action === "start_focus") {
    targetPath = "/?action=start_focus";
  } else if (action === "start_break") {
    targetPath = "/?action=start_break";
  } else if (action === "open_completion") {
    targetPath = "/?action=open_completion";
  } else if (action === "open_timer") {
    targetPath = "/?action=open_timer";
  }

  event.waitUntil(
    (async () => {
      const targetUrl = new URL(targetPath, self.location.origin).href;
      const allClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      for (const client of allClients) {
        if (client.url.startsWith(self.location.origin)) {
          await client.focus();
          client.postMessage({
            type: "FOCUS_NOTIFICATION_ACTION",
            action,
            category: data.category,
            sessionId: data.sessionId,
          });
          return;
        }
      }

      if (self.clients.openWindow) {
        await self.clients.openWindow(targetUrl);
      }
    })(),
  );
});

self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of allClients) {
        client.postMessage({ type: "FOCUS_PUSH_SUBSCRIPTION_CHANGED" });
      }
    })(),
  );
});
