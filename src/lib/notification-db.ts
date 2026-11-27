import {
  defaultNotificationPreferences,
  sanitizeNotificationPreferences,
  type NotificationCategory,
  type NotificationPreferences,
} from "./notifications-core";

const DB_NAME = "focus-companion-db";
const DB_VERSION = 1;
const STORE_PREFERENCES = "preferences";
const STORE_TIMER = "timer_state";
const STORE_DELIVERED = "delivered_notifications";

const PREFS_KEY = "default";
const TIMER_KEY = "current";
const LS_BACKUP_KEY = "focus.notificationRecord";

export interface StoredNotificationRecord {
  key: string;
  installationId: string;
  installSecret: string;
  preferences: NotificationPreferences;
  pushEndpoint: string | null;
  vapidPublicKey: string | null;
  pendingSync: boolean;
  lastSyncedAt: number | null;
}

export interface StoredTimerSnapshot {
  key: string;
  sessionId: string;
  scheduleVersion: number;
  kind: "focus" | "break";
  status: "idle" | "running" | "paused" | "completed";
  minutes: number;
  label: string;
  startedAt: number;
  endAt: number;
  leftMs: number;
  updatedAt: number;
}

export interface DeliveredNotificationRecord {
  dedupeKey: string;
  category: NotificationCategory;
  deliveredAt: number;
}

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(buf);
  } else {
    for (let i = 0; i < buf.length; i++) {
      buf[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function createInstallationIdentity(): { installationId: string; installSecret: string } {
  return {
    installationId: `inst_${randomHex(12)}`,
    installSecret: randomHex(32),
  };
}

function createDefaultRecord(): StoredNotificationRecord {
  const { installationId, installSecret } = createInstallationIdentity();
  return {
    key: PREFS_KEY,
    installationId,
    installSecret,
    preferences: defaultNotificationPreferences(),
    pushEndpoint: null,
    vapidPublicKey: null,
    pendingSync: false,
    lastSyncedAt: null,
  };
}

function hasIndexedDB(): boolean {
  return typeof indexedDB !== "undefined";
}

function openCompanionDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!hasIndexedDB()) {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_PREFERENCES)) {
        db.createObjectStore(STORE_PREFERENCES, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(STORE_TIMER)) {
        db.createObjectStore(STORE_TIMER, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(STORE_DELIVERED)) {
        db.createObjectStore(STORE_DELIVERED, { keyPath: "dedupeKey" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Failed to open IndexedDB"));
  });
}

async function idbGet<T>(storeName: string, key: string): Promise<T | null> {
  const db = await openCompanionDB();
  try {
    return await new Promise<T | null>((resolve, reject) => {
      const tx = db.transaction(storeName, "readonly");
      const store = tx.objectStore(storeName);
      const req = store.get(key);
      req.onsuccess = () => resolve((req.result as T | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

async function idbPut<T>(storeName: string, value: T): Promise<void> {
  const db = await openCompanionDB();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);
      store.put(value);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

function readLocalBackup(): StoredNotificationRecord | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(LS_BACKUP_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredNotificationRecord;
  } catch {
    return null;
  }
}

function writeLocalBackup(rec: StoredNotificationRecord): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(LS_BACKUP_KEY, JSON.stringify(rec));
  } catch {
    // Ignore storage quota errors
  }
}

const memoryDelivered = new Map<string, DeliveredNotificationRecord>();
let memoryTimerSnapshot: StoredTimerSnapshot | null = null;
let memoryRecord: StoredNotificationRecord | null = null;

export async function loadNotificationRecord(): Promise<StoredNotificationRecord> {
  try {
    if (hasIndexedDB()) {
      const existing = await idbGet<StoredNotificationRecord>(STORE_PREFERENCES, PREFS_KEY);
      if (existing && existing.installationId && existing.installSecret) {
        const sanitized: StoredNotificationRecord = {
          ...existing,
          key: PREFS_KEY,
          preferences: sanitizeNotificationPreferences(existing.preferences),
        };
        writeLocalBackup(sanitized);
        memoryRecord = sanitized;
        return sanitized;
      }
    }
  } catch {
    // Fall back to localStorage / memory
  }

  const backup = readLocalBackup();
  if (backup && backup.installationId && backup.installSecret) {
    const sanitized: StoredNotificationRecord = {
      ...backup,
      key: PREFS_KEY,
      preferences: sanitizeNotificationPreferences(backup.preferences),
    };
    memoryRecord = sanitized;
    try {
      if (hasIndexedDB()) await idbPut(STORE_PREFERENCES, sanitized);
    } catch {
      // Ignore IDB write errors
    }
    return sanitized;
  }

  const fresh = memoryRecord ?? createDefaultRecord();
  memoryRecord = fresh;
  await saveNotificationRecord(fresh);
  return fresh;
}

export async function saveNotificationRecord(record: StoredNotificationRecord): Promise<void> {
  const sanitized: StoredNotificationRecord = {
    ...record,
    key: PREFS_KEY,
    preferences: sanitizeNotificationPreferences(record.preferences),
  };
  memoryRecord = sanitized;
  writeLocalBackup(sanitized);
  try {
    if (hasIndexedDB()) {
      await idbPut(STORE_PREFERENCES, sanitized);
    }
  } catch {
    // Ignore IDB write errors in restricted environments
  }
}

export async function saveTimerSnapshotToDB(
  snapshot: Omit<StoredTimerSnapshot, "key">,
): Promise<void> {
  const rec: StoredTimerSnapshot = { ...snapshot, key: TIMER_KEY };
  memoryTimerSnapshot = rec;
  try {
    if (hasIndexedDB()) {
      await idbPut(STORE_TIMER, rec);
    }
  } catch {
    // Ignore IDB write errors
  }
}

export async function loadTimerSnapshotFromDB(): Promise<StoredTimerSnapshot | null> {
  try {
    if (hasIndexedDB()) {
      const existing = await idbGet<StoredTimerSnapshot>(STORE_TIMER, TIMER_KEY);
      if (existing) return existing;
    }
  } catch {
    // Fall back to memory
  }
  return memoryTimerSnapshot;
}

const DEDUPE_TTL_MS = 24 * 60 * 60 * 1000;

export async function hasDeliveredNotification(dedupeKey: string): Promise<boolean> {
  if (!dedupeKey) return false;
  const now = Date.now();
  try {
    if (hasIndexedDB()) {
      const existing = await idbGet<DeliveredNotificationRecord>(STORE_DELIVERED, dedupeKey);
      if (existing && now - existing.deliveredAt < DEDUPE_TTL_MS) {
        return true;
      }
    }
  } catch {
    // Fallback below
  }
  const mem = memoryDelivered.get(dedupeKey);
  return Boolean(mem && now - mem.deliveredAt < DEDUPE_TTL_MS);
}

export async function markNotificationDelivered(
  dedupeKey: string,
  category: NotificationCategory,
): Promise<void> {
  if (!dedupeKey) return;
  const rec: DeliveredNotificationRecord = {
    dedupeKey,
    category,
    deliveredAt: Date.now(),
  };
  memoryDelivered.set(dedupeKey, rec);
  try {
    if (hasIndexedDB()) {
      await idbPut(STORE_DELIVERED, rec);
    }
  } catch {
    // Ignore IDB errors
  }
}

export async function clearNotificationDBForTests(): Promise<void> {
  memoryDelivered.clear();
  memoryTimerSnapshot = null;
  memoryRecord = null;
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem(LS_BACKUP_KEY);
  }
  if (hasIndexedDB() && typeof indexedDB.deleteDatabase === "function") {
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
  }
}
