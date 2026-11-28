export interface StoredCustomBackground {
  id: "active";
  dataUrl: string;
  name: string;
  updatedAt: number;
}

const DB_NAME = "focus-custom-bg-db";
const DB_VERSION = 1;
const STORE_NAME = "backgrounds";
const ACTIVE_KEY = "active" as const;

const MAX_RAW_FILE_BYTES = 15 * 1024 * 1024; // 15 MB raw upload cap
const MAX_DIMENSION_PX = 1920;
const REENCODE_THRESHOLD_BYTES = 450 * 1024;
const DEFAULT_DIM = 0.4;
const MIN_DIM = 0.15;
const MAX_DIM = 0.75;

const ALLOWED_IMAGE_EXT = /\.(png|jpe?g|webp|gif|avif|bmp|svg)$/i;

let memoryFallback: StoredCustomBackground | null = null;

export function clampBackgroundDim(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_DIM;
  return Math.min(MAX_DIM, Math.max(MIN_DIM, Math.round(value * 100) / 100));
}

function openBackgroundDB(): Promise<IDBDatabase | null> {
  if (typeof window === "undefined" || typeof indexedDB === "undefined") {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "id" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function loadCustomBackground(): Promise<StoredCustomBackground | null> {
  const db = await openBackgroundDB();
  if (!db) return memoryFallback;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(ACTIVE_KEY);
      req.onsuccess = () => {
        const res = req.result as StoredCustomBackground | undefined;
        if (res && typeof res.dataUrl === "string" && res.dataUrl.length > 0) {
          memoryFallback = res;
          resolve(res);
          return;
        }
        resolve(memoryFallback);
      };
      req.onerror = () => resolve(memoryFallback);
    } catch {
      resolve(memoryFallback);
    } finally {
      try {
        db.close();
      } catch {
        // Ignore close error
      }
    }
  });
}

export async function saveCustomBackground(
  record: Omit<StoredCustomBackground, "id">,
): Promise<StoredCustomBackground> {
  const full: StoredCustomBackground = {
    id: ACTIVE_KEY,
    dataUrl: record.dataUrl,
    name: record.name,
    updatedAt: record.updatedAt,
  };
  memoryFallback = full;

  const db = await openBackgroundDB();
  if (!db) return full;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(full);
      req.onsuccess = () => resolve(full);
      req.onerror = () => resolve(full);
    } catch {
      resolve(full);
    } finally {
      try {
        db.close();
      } catch {
        // Ignore close error
      }
    }
  });
}

export async function deleteCustomBackground(): Promise<void> {
  memoryFallback = null;
  const db = await openBackgroundDB();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(ACTIVE_KEY);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    } catch {
      resolve();
    } finally {
      try {
        db.close();
      } catch {
        // Ignore close error
      }
    }
  });
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Could not read image file."));
      }
    };
    reader.onerror = () => reject(new Error("Could not read image file."));
    reader.readAsDataURL(file);
  });
}

function downscaleDataUrlIfNeeded(
  dataUrl: string,
  mimeType: string,
  rawSize: number,
): Promise<string> {
  // Preserve animated GIFs or vector SVGs unless we don't need canvas optimization
  if (
    typeof document === "undefined" ||
    typeof Image === "undefined" ||
    mimeType === "image/gif" ||
    mimeType === "image/svg+xml"
  ) {
    return Promise.resolve(dataUrl);
  }

  let canvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D | null = null;
  try {
    canvas = document.createElement("canvas");
    ctx = canvas.getContext("2d");
  } catch {
    return Promise.resolve(dataUrl);
  }
  if (!ctx) {
    return Promise.resolve(dataUrl);
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: string) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeoutId);
        resolve(result);
      }
    };

    const timeoutId = setTimeout(() => finish(dataUrl), 2500);

    const img = new Image();
    img.onload = () => {
      try {
        const width = img.naturalWidth || img.width;
        const height = img.naturalHeight || img.height;
        if (!width || !height) {
          finish(dataUrl);
          return;
        }

        const needsResize = width > MAX_DIMENSION_PX || height > MAX_DIMENSION_PX;
        const needsCompress = rawSize > REENCODE_THRESHOLD_BYTES;
        if (!needsResize && !needsCompress) {
          finish(dataUrl);
          return;
        }

        const scale = needsResize
          ? Math.min(MAX_DIMENSION_PX / width, MAX_DIMENSION_PX / height)
          : 1;
        const targetW = Math.max(1, Math.round(width * scale));
        const targetH = Math.max(1, Math.round(height * scale));

        canvas.width = targetW;
        canvas.height = targetH;
        ctx.drawImage(img, 0, 0, targetW, targetH);
        const outputMime = mimeType === "image/webp" ? "image/webp" : "image/jpeg";
        const compressed = canvas.toDataURL(outputMime, 0.85);
        finish(compressed && compressed.length < dataUrl.length ? compressed : dataUrl);
      } catch {
        finish(dataUrl);
      }
    };
    img.onerror = () => finish(dataUrl);
    img.src = dataUrl;
  });
}

export async function processUploadedBackgroundFile(
  file: File,
): Promise<{ dataUrl: string; name: string }> {
  const mime = (file.type || "").toLowerCase();
  const isImage = mime.startsWith("image/") || ALLOWED_IMAGE_EXT.test(file.name || "");
  if (!isImage) {
    throw new Error("Please choose an image file (PNG, JPG, WebP, or GIF).");
  }
  if (file.size <= 0) {
    throw new Error("Selected image file appears to be empty.");
  }
  if (file.size > MAX_RAW_FILE_BYTES) {
    throw new Error("Image is too large (max 15 MB).");
  }

  const rawDataUrl = await readFileAsDataUrl(file);
  if (!rawDataUrl.startsWith("data:image/")) {
    throw new Error("Invalid image data. Please try another file.");
  }

  const finalDataUrl = await downscaleDataUrlIfNeeded(rawDataUrl, mime, file.size);
  return {
    dataUrl: finalDataUrl,
    name: file.name?.trim() || "Custom background",
  };
}
