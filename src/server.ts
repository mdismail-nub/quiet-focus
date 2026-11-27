import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import {
  calculateSessionBaseXp,
  isoDayKey,
  isoWeekKey,
  validateSessionSubmission,
} from "./lib/gamification";

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

async function handleApiRoute(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname === "/api/health" && (request.method === "GET" || request.method === "HEAD")) {
    return jsonResponse({ ok: true, serverTime: Date.now() }, 200);
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
