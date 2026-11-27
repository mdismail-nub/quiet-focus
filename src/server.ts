import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import {
  calculateSessionBaseXp,
  isoDayKey,
  isoWeekKey,
  validateSessionSubmission,
} from "./lib/gamification";
import {
  cancelSessionCompletion,
  getPublicVapidInfo,
  removePushSubscription,
  scheduleSessionCompletion,
  sendTestPush,
  startPushScheduler,
  updateSubscriptionPreferences,
  upsertPushSubscription,
} from "./lib/push-server";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

startPushScheduler();

// Simple sliding-window rate limiter for API routes (max 30 submissions per minute per client key)
const rateBuckets = new Map<string, number[]>();
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30;

function checkRateLimit(key: string, now: number): boolean {
  const prev = rateBuckets.get(key) ?? [];
  const recent = prev.filter((ts) => now - ts < RATE_WINDOW_MS);
  if (recent.length >= RATE_LIMIT_MAX) {
    rateBuckets.set(key, recent);
    return false;
  }
  recent.push(now);
  rateBuckets.set(key, recent);
  return true;
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function readInstallationAuth(request: Request, body: Record<string, unknown>) {
  const headerId = request.headers.get("x-installation-id")?.trim() ?? "";
  const bodyId = typeof body["installationId"] === "string" ? body["installationId"].trim() : "";
  const installationId = headerId || bodyId;
  const installSecret = request.headers.get("x-installation-secret")?.trim() ?? "";
  return { installationId, installSecret };
}

async function handleApiRoute(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname === "/api/health" && (request.method === "GET" || request.method === "HEAD")) {
    return jsonResponse({ ok: true, serverTime: Date.now() }, 200);
  }

  if (url.pathname === "/api/push/vapid-public-key" && request.method === "GET") {
    return jsonResponse(getPublicVapidInfo(), 200);
  }

  if (url.pathname.startsWith("/api/push/") && request.method === "POST") {
    const now = Date.now();
    const clientKey =
      request.headers.get("x-installation-id")?.slice(0, 64) ||
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "local-push-client";

    if (!checkRateLimit(`push:${clientKey}`, now)) {
      return jsonResponse(
        { ok: false, error: "Too many push requests. Please retry shortly." },
        429,
      );
    }

    let body: Record<string, unknown>;
    try {
      const parsed = await request.json();
      body = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
    } catch {
      return jsonResponse({ ok: false, error: "Invalid JSON payload." }, 400);
    }

    const { installationId, installSecret } = readInstallationAuth(request, body);
    if (!installationId || !installSecret) {
      return jsonResponse({ ok: false, error: "Installation credentials required." }, 401);
    }

    if (url.pathname === "/api/push/subscribe") {
      const result = upsertPushSubscription({
        installationId,
        installSecret,
        subscription: body["subscription"] as Parameters<
          typeof upsertPushSubscription
        >[0]["subscription"],
        preferences: (body["preferences"] ?? {}) as Parameters<
          typeof upsertPushSubscription
        >[0]["preferences"],
        activeSessionStatus:
          body["activeSessionStatus"] === "running" || body["activeSessionStatus"] === "paused"
            ? body["activeSessionStatus"]
            : "idle",
      });
      return jsonResponse(result, result.ok ? 200 : 400);
    }

    if (url.pathname === "/api/push/unsubscribe") {
      const result = removePushSubscription(installationId, installSecret);
      return jsonResponse(result, result.ok ? 200 : 401);
    }

    if (url.pathname === "/api/push/preferences") {
      const prefsBody =
        body["preferences"] && typeof body["preferences"] === "object"
          ? {
              preferences: body["preferences"] as NonNullable<
                Parameters<typeof updateSubscriptionPreferences>[0]["preferences"]
              >,
            }
          : {};
      const result = updateSubscriptionPreferences({
        installationId,
        installSecret,
        ...prefsBody,
        ...(body["activeSessionStatus"] === "idle" ||
        body["activeSessionStatus"] === "running" ||
        body["activeSessionStatus"] === "paused"
          ? { activeSessionStatus: body["activeSessionStatus"] }
          : {}),
      });
      return jsonResponse(result, result.ok ? 200 : 401);
    }

    if (url.pathname === "/api/push/schedule-session") {
      const result = scheduleSessionCompletion({
        installationId,
        installSecret,
        sessionId: typeof body["sessionId"] === "string" ? body["sessionId"] : "",
        scheduleVersion: typeof body["scheduleVersion"] === "number" ? body["scheduleVersion"] : 0,
        kind: body["kind"] === "break" ? "break" : "focus",
        expectedEndAt: typeof body["expectedEndAt"] === "number" ? body["expectedEndAt"] : 0,
        minutes: typeof body["minutes"] === "number" ? body["minutes"] : 0,
        label: typeof body["label"] === "string" ? body["label"] : "",
      });
      return jsonResponse(result, result.ok ? 200 : 400);
    }

    if (url.pathname === "/api/push/cancel-session") {
      const result = cancelSessionCompletion({
        installationId,
        installSecret,
        ...(typeof body["sessionId"] === "string" ? { sessionId: body["sessionId"] } : {}),
        ...(typeof body["scheduleVersion"] === "number"
          ? { scheduleVersion: body["scheduleVersion"] }
          : {}),
        nextStatus: body["nextStatus"] === "paused" ? "paused" : "idle",
      });
      return jsonResponse(result, result.ok ? 200 : 400);
    }

    if (url.pathname === "/api/push/test") {
      const result = await sendTestPush(installationId, installSecret);
      return jsonResponse(result, result.ok ? 200 : 400);
    }
  }

  if (url.pathname === "/api/sessions/validate" && request.method === "POST") {
    const now = Date.now();
    const clientKey =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("authorization")?.slice(0, 48) ||
      "local-client";

    if (!checkRateLimit(clientKey, now)) {
      return jsonResponse(
        { valid: false, error: "Too many sync requests. Please retry shortly." },
        429,
      );
    }

    const authHeader = request.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ") || authHeader.length < 24) {
      return jsonResponse({ valid: false, error: "Authentication token required." }, 401);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ valid: false, error: "Invalid JSON payload." }, 400);
    }

    const payload = (body ?? {}) as {
      sessionId?: unknown;
      startedAt?: unknown;
      endedAt?: unknown;
      minutes?: unknown;
      label?: unknown;
    };

    const candidate = {
      sessionId: typeof payload.sessionId === "string" ? payload.sessionId : "",
      startedAt: typeof payload.startedAt === "number" ? payload.startedAt : 0,
      endedAt: typeof payload.endedAt === "number" ? payload.endedAt : 0,
      minutes: typeof payload.minutes === "number" ? payload.minutes : 0,
      label: typeof payload.label === "string" ? payload.label.trim().slice(0, 60) : "",
    };

    const check = validateSessionSubmission(candidate, now);
    if (!check.valid) {
      return jsonResponse({ valid: false, error: check.reason ?? "Invalid session." }, 400);
    }

    return jsonResponse(
      {
        valid: true,
        sessionId: candidate.sessionId,
        verifiedMinutes: candidate.minutes,
        xpAwarded: calculateSessionBaseXp(candidate.minutes),
        dayKey: isoDayKey(candidate.endedAt),
        weekKey: isoWeekKey(candidate.endedAt),
        serverTime: now,
      },
      200,
    );
  }

  return null;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

// Hosting compresses every response at the edge. Never compress a body (gzip, brotli,
// CompressionStream) or set content-encoding here or in a server route: the body gets encoded
// twice and renders garbled.
export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const apiResponse = await handleApiRoute(request);
      if (apiResponse) return apiResponse;

      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
