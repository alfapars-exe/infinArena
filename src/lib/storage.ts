import fs from "fs";
import path from "path";

const HF_ROOT = "/data";
const HF_APP_DIR = path.join(HF_ROOT, "infinarena");

function isHuggingFaceSpace(): boolean {
  return Boolean(
    process.env.SPACE_ID ||
      process.env.SPACE_HOST ||
      process.env.SPACE_REPO_NAME ||
      process.env.HF_SPACE_ID
  );
}

function parseBooleanEnv(value: string | undefined): boolean | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return undefined;
}

function resolveDefaultStorageDir(): string {
  if (isHuggingFaceSpace()) {
    return HF_APP_DIR;
  }
  return path.join(process.cwd(), "data");
}

function resolveRequirePersistentStorage(): boolean {
  const fromEnv = parseBooleanEnv(process.env.REQUIRE_PERSISTENT_STORAGE);
  if (typeof fromEnv === "boolean") {
    return fromEnv;
  }
  return isHuggingFaceSpace();
}

export function resolveStorageRoot(): string {
  const configured = process.env.APP_STORAGE_DIR?.trim();
  const root = configured && configured.length > 0 ? configured : resolveDefaultStorageDir();
  return path.isAbsolute(root) ? root : path.join(process.cwd(), root);
}

export function resolveUploadsDir(): string {
  return path.join(resolveStorageRoot(), "uploads");
}

export function resolveDatabaseUrl(): string {
  const fromEnv = process.env.DATABASE_URL?.trim();
  if (fromEnv) {
    return fromEnv;
  }

  const dbPath = path.join(resolveStorageRoot(), "quiz.db");
  return `file:${dbPath}`;
}

function isUnderHfPersistentRoot(rootDir: string): boolean {
  const rawNormalized = rootDir.replace(/\\/g, "/");
  if (rawNormalized === HF_ROOT || rawNormalized.startsWith(`${HF_ROOT}/`)) {
    return true;
  }

  const resolved = path.resolve(rootDir).replace(/\\/g, "/");
  return resolved === HF_ROOT || resolved.startsWith(`${HF_ROOT}/`);
}

function hasDataMount(): boolean {
  if (process.platform === "win32") {
    return false;
  }

  try {
    const mounts = fs.readFileSync("/proc/mounts", "utf8");
    return mounts
      .split("\n")
      .some((line) => line.trim().length > 0 && line.split(" ")[1] === HF_ROOT);
  } catch {
    return false;
  }
}

export function ensureStorageReady(): {
  storageRoot: string;
  uploadsDir: string;
  requirePersistentStorage: boolean;
} {
  const storageRoot = resolveStorageRoot();
  const uploadsDir = resolveUploadsDir();
  const requirePersistentStorage = resolveRequirePersistentStorage();

  if (requirePersistentStorage && !isUnderHfPersistentRoot(storageRoot)) {
    throw new Error(
      [
        "Persistent storage is required but APP_STORAGE_DIR is not under /data.",
        `APP_STORAGE_DIR resolved to: ${storageRoot}`,
        "Set APP_STORAGE_DIR to a /data/... path in Hugging Face Spaces.",
      ].join(" ")
    );
  }

  if (requirePersistentStorage && !hasDataMount()) {
    throw new Error(
      [
        "Persistent storage is required but /data is not mounted.",
        "Enable Persistent Storage in your Hugging Face Space settings.",
      ].join(" ")
    );
  }

  try {
    fs.mkdirSync(storageRoot, { recursive: true });
    fs.mkdirSync(uploadsDir, { recursive: true });
  } catch (err) {
    throw new Error(
      [
        "Failed to create storage directories.",
        `Storage root: ${storageRoot}.`,
        `Uploads dir: ${uploadsDir}.`,
        `Original error: ${String(err)}`,
      ].join(" ")
    );
  }

  const writeCheckFile = path.join(
    storageRoot,
    `.write-check-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`
  );

  try {
    fs.writeFileSync(writeCheckFile, "ok");
    fs.unlinkSync(writeCheckFile);
  } catch (err) {
    throw new Error(
      [
        "Storage path is not writable.",
        `Storage root: ${storageRoot}.`,
        `Persistent storage required: ${requirePersistentStorage}.`,
        `Original error: ${String(err)}`,
      ].join(" ")
    );
  }

  return { storageRoot, uploadsDir, requirePersistentStorage };
}
