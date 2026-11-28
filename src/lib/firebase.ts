import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { doc, getDocFromServer, getFirestore } from "firebase/firestore";
import firebaseConfig from "../../firebase-applet-config.json";

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

export enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null | undefined;
    email?: string | null | undefined;
    emailVerified?: boolean | null | undefined;
    isAnonymous?: boolean | null | undefined;
    tenantId?: string | null | undefined;
    providerInfo?: {
      providerId?: string | null | undefined;
      email?: string | null | undefined;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) ?? [],
    },
    operationType,
    path,
  };
  console.error("Firestore Error: ", JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

let connectionChecked = false;

export async function testConnection(): Promise<void> {
  if (typeof window === "undefined" || connectionChecked) return;
  if (!auth.currentUser) return;
  connectionChecked = true;
  try {
    await getDocFromServer(doc(db, "test", "connection"));
  } catch (error) {
    if (error instanceof Error && error.message.includes("the client is offline")) {
      console.warn("Firestore client is offline; operating in local-first mode.");
    }
  }
}

export function formatFirebaseAuthError(error: unknown): string | null {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code)
      : "";
  const rawMessage =
    error instanceof Error ? error.message : typeof error === "string" ? error : "";

  switch (code) {
    case "auth/cancelled-popup-request":
      return null;
    case "auth/popup-closed-by-user":
    case "auth/user-cancelled":
      return "Sign-in was cancelled before completion. If your browser closed the popup, allow popups for this site and try again.";
    case "auth/popup-blocked":
      return "Sign-in popup was blocked by your browser. Allow popups for this site and try again.";
    case "auth/operation-not-supported-in-this-environment":
      return "Google Sign-In popups are restricted in this browser context. Open the app in a standard browser tab with cookies enabled and try again.";
    case "auth/web-storage-unsupported":
      return "Browser storage or third-party cookies are disabled. Enable cookies for this site to sign in.";
    case "auth/network-request-failed":
      return "Network error during sign-in. Check your connection and try again.";
    case "auth/too-many-requests":
      return "Too many sign-in attempts. Please wait a moment and try again.";
    case "auth/internal-error":
      return "Google Sign-In encountered a temporary error. Allow popups and try again.";
    case "auth/unauthorized-domain": {
      const host = typeof window !== "undefined" ? window.location.hostname : "this domain";
      return `This domain (${host}) is not authorized for Google Sign-In in Firebase Authentication.`;
    }
    default:
      if (/Cross-Origin-Opener-Policy|window\.closed/i.test(rawMessage)) {
        return "Sign-in popup lost connection to the page. Please allow popups for this site and try again.";
      }
      if (rawMessage) {
        return rawMessage.replace(/^Firebase:\s*/i, "").replace(/\s*\(auth\/[^)]+\)\.?$/i, "");
      }
      return "Could not complete Google Sign-In. Please try again.";
  }
}

export function isDynamicImportError(error: unknown): boolean {
  const raw = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const name =
    typeof error === "object" && error !== null && "name" in error
      ? String((error as { name?: unknown }).name)
      : "";
  const combined = `${name} ${raw}`.toLowerCase();
  return (
    combined.includes("failed to fetch dynamically imported module") ||
    combined.includes("importing a module script failed") ||
    combined.includes("error loading dynamically imported module") ||
    combined.includes("chunkloaderror") ||
    combined.includes("loading chunk")
  );
}

export function formatUserErrorMessage(
  error: unknown,
  fallback = "Something went wrong. Please try again.",
): string {
  if (isDynamicImportError(error)) {
    return "A page module failed to load, likely after a recent update. Reload the page to continue.";
  }

  let raw = error instanceof Error ? error.message : typeof error === "string" ? error : "";

  if (raw.trim().startsWith("{")) {
    try {
      const parsed = JSON.parse(raw) as Partial<FirestoreErrorInfo>;
      if (typeof parsed.error === "string" && parsed.error.length > 0) {
        raw = parsed.error;
      }
    } catch {
      // Keep original message if not valid JSON
    }
  }

  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code)
      : "";

  const combined = `${code} ${raw}`.toLowerCase();

  if (
    combined.includes("resource-exhausted") ||
    combined.includes("quota exceeded") ||
    combined.includes("quota")
  ) {
    return "Cloud sync is temporarily unavailable because the free Firebase daily quota was reached. Your sessions remain safely saved on this device.";
  }

  if (
    combined.includes("permission-denied") ||
    combined.includes("missing or insufficient permissions")
  ) {
    return "You don't have permission for this action right now. Please ensure your account is signed in and verified.";
  }

  if (combined.includes("failed-precondition") || combined.includes("requires an index")) {
    return "This cloud query is temporarily unavailable while indexes update. Local progress remains safe.";
  }

  if (
    combined.includes("the client is offline") ||
    combined.includes("unavailable") ||
    combined.includes("deadline-exceeded") ||
    combined.includes("network-request-failed") ||
    combined.includes("failed to fetch")
  ) {
    return "Unable to reach the cloud right now. Your changes remain safely saved locally.";
  }

  const cleaned = raw
    .replace(/^Firebase:\s*/i, "")
    .replace(/\s*\((?:auth|firestore)\/[^)]+\)\.?$/i, "")
    .trim();

  if (!cleaned || cleaned.startsWith("{")) {
    return fallback;
  }
  return cleaned;
}
