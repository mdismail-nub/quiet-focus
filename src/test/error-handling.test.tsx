import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  formatFirebaseAuthError,
  formatUserErrorMessage,
  isDynamicImportError,
  OperationType,
  type FirestoreErrorInfo,
} from "@/lib/firebase";
import { AppErrorBoundary } from "@/routes/__root";
import serverHandler from "@/server";

describe("Popup, Auth, Firestore Error Formatting & AppErrorBoundary", () => {
  it("formats all Firebase Auth popup and environment error codes cleanly", () => {
    expect(formatFirebaseAuthError({ code: "auth/cancelled-popup-request" })).toBeNull();
    expect(formatFirebaseAuthError({ code: "auth/popup-closed-by-user" })).toContain(
      "cancelled before completion",
    );
    expect(formatFirebaseAuthError({ code: "auth/user-cancelled" })).toContain(
      "cancelled before completion",
    );
    expect(formatFirebaseAuthError({ code: "auth/popup-blocked" })).toContain("blocked");
    expect(
      formatFirebaseAuthError({ code: "auth/operation-not-supported-in-this-environment" }),
    ).toContain("standard browser tab");
    expect(formatFirebaseAuthError({ code: "auth/web-storage-unsupported" })).toContain("cookies");
    expect(formatFirebaseAuthError({ code: "auth/unauthorized-domain" })).toContain(
      "not authorized",
    );
    expect(formatFirebaseAuthError({ code: "auth/too-many-requests" })).toContain("Too many");
    expect(formatFirebaseAuthError({ code: "auth/network-request-failed" })).toContain("Network");
    expect(
      formatFirebaseAuthError(
        new Error("Cross-Origin-Opener-Policy policy would block the window.closed call."),
      ),
    ).toContain("lost connection");
  });

  it("unwraps JSON FirestoreErrorInfo strings into friendly messages", () => {
    const info: FirestoreErrorInfo = {
      error: "Missing or insufficient permissions.",
      operationType: OperationType.LIST,
      path: "leaderboard_entries",
      authInfo: { userId: null },
    };
    const wrapped = new Error(JSON.stringify(info));
    const formatted = formatUserErrorMessage(wrapped);
    expect(formatted).not.toContain("{");
    expect(formatted).not.toContain("operationType");
    expect(formatted).toContain("permission");

    const quotaInfo: FirestoreErrorInfo = {
      error: "Quota exceeded for quota metric 'Read requests'.",
      operationType: OperationType.GET,
      path: "user_profiles/u1",
      authInfo: { userId: "u1" },
    };
    expect(formatUserErrorMessage(new Error(JSON.stringify(quotaInfo)))).toContain("daily quota");

    expect(
      formatUserErrorMessage(new Error("The query requires an index (failed-precondition).")),
    ).toContain("indexes update");

    expect(
      formatUserErrorMessage(new Error("Failed to get document because the client is offline.")),
    ).toContain("saved locally");
  });

  it("catches thrown Firestore/render errors inside AppErrorBoundary and recovers cleanly", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    let shouldThrow = true;

    function Bomb() {
      if (shouldThrow) {
        throw new Error(
          JSON.stringify({
            error: "Missing or insufficient permissions.",
            operationType: "get",
            path: "user_profiles/u1",
            authInfo: {},
          }),
        );
      }
      return <p>Recovered content</p>;
    }

    render(
      <AppErrorBoundary>
        <Bomb />
      </AppErrorBoundary>,
    );

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(screen.getByText(/permission/i)).toBeInTheDocument();
    expect(screen.queryByText(/operationType/)).not.toBeInTheDocument();

    shouldThrow = false;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(screen.getByText("Recovered content")).toBeInTheDocument();

    consoleSpy.mockRestore();
  });

  it("detects dynamic module import failures cleanly and shows Reload recovery in AppErrorBoundary", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const err = new TypeError(
      "Failed to fetch dynamically imported module: https://example.com/src/routes/settings.tsx?tsr-split=component",
    );
    expect(isDynamicImportError(err)).toBe(true);
    expect(formatUserErrorMessage(err)).toContain("Reload the page");

    function ChunkBomb() {
      if (err) throw err;
      return <p>ok</p>;
    }

    render(
      <AppErrorBoundary>
        <ChunkBomb />
      </AppErrorBoundary>,
    );

    expect(screen.getByText("Updating app")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reload page" })).toBeInTheDocument();
    consoleSpy.mockRestore();
  });

  it("serves /api/health and applies COOP allow-popups behavior safely on server.ts", async () => {
    const healthRes = await serverHandler.fetch(
      new Request("http://localhost:3000/api/health"),
      {},
      {},
    );
    expect(healthRes.status).toBe(200);
    const body = (await healthRes.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });
});
