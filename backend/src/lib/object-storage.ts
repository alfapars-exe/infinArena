/**
 * Object storage abstraction.
 *
 * When S3_BUCKET is configured, files are stored in S3/R2.
 * Otherwise, falls back to local filesystem (current behavior).
 */

import { randomBytes } from "crypto";
import { extname, join } from "path";
import { readFile, writeFile } from "fs/promises";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { createLogger } from "@/lib/logger";
import { resolveUploadsDir, ensureStorageReady } from "@/lib/storage";

const log = createLogger("ObjectStorage");

const S3_BUCKET = process.env.S3_BUCKET || "";
const S3_REGION = process.env.S3_REGION || process.env.AWS_REGION || "auto";
const S3_ENDPOINT = process.env.S3_ENDPOINT || "";
const S3_PUBLIC_URL = process.env.S3_PUBLIC_URL || ""; // CDN or public bucket URL prefix

let s3Client: S3Client | null = null;

export function isS3Enabled(): boolean {
  return Boolean(S3_BUCKET);
}

function getS3Client(): S3Client {
  if (!s3Client) {
    const config: ConstructorParameters<typeof S3Client>[0] = {
      region: S3_REGION,
    };
    if (S3_ENDPOINT) {
      config.endpoint = S3_ENDPOINT;
      config.forcePathStyle = true; // Required for R2/MinIO
    }
    s3Client = new S3Client(config);
    log.info(`S3 client initialized (bucket=${S3_BUCKET}, region=${S3_REGION})`);
  }
  return s3Client;
}

const MIME_MAP: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

function getContentType(filename: string): string {
  const ext = extname(filename).toLowerCase();
  return MIME_MAP[ext] || "application/octet-stream";
}

export interface UploadResult {
  /** Relative path for API serving: /api/uploads/filename */
  url: string;
  /** Full public URL (CDN or local origin) */
  absoluteUrl: string;
  /** S3 key if stored in S3, null for local */
  s3Key: string | null;
}

/**
 * Store a file. Uses S3 when configured, local filesystem otherwise.
 */
export async function storeFile(
  buffer: Buffer,
  originalFilename: string,
  requestOrigin: string
): Promise<UploadResult> {
  const ext = extname(originalFilename || "").replace(".", "") || "png";
  const uniqueName = `${randomBytes(16).toString("hex")}.${ext}`;

  if (isS3Enabled()) {
    const s3Key = `uploads/${uniqueName}`;
    const client = getS3Client();
    await client.send(
      new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: s3Key,
        Body: buffer,
        ContentType: getContentType(uniqueName),
        CacheControl: "public, max-age=31536000, immutable",
      })
    );

    const url = `/api/uploads/${uniqueName}`;
    const absoluteUrl = S3_PUBLIC_URL
      ? `${S3_PUBLIC_URL.replace(/\/$/, "")}/${s3Key}`
      : new URL(url, requestOrigin).toString();

    log.debug(`File stored in S3: ${s3Key}`);
    return { url, absoluteUrl, s3Key };
  }

  // Local filesystem fallback
  ensureStorageReady();
  const filePath = join(resolveUploadsDir(), uniqueName);
  await writeFile(filePath, buffer);

  const url = `/api/uploads/${uniqueName}`;
  const absoluteUrl = new URL(url, requestOrigin).toString();

  return { url, absoluteUrl, s3Key: null };
}

/**
 * Retrieve a file. Returns the buffer and content type.
 * Uses S3 when configured, local filesystem otherwise.
 */
export async function retrieveFile(
  filename: string
): Promise<{ buffer: Buffer; contentType: string } | null> {
  if (isS3Enabled()) {
    try {
      const client = getS3Client();
      const response = await client.send(
        new GetObjectCommand({
          Bucket: S3_BUCKET,
          Key: `uploads/${filename}`,
        })
      );

      if (!response.Body) return null;

      // Convert readable stream to buffer
      const chunks: Uint8Array[] = [];
      for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);
      const contentType =
        response.ContentType || getContentType(filename);

      return { buffer, contentType };
    } catch (err: any) {
      if (err?.name === "NoSuchKey" || err?.$metadata?.httpStatusCode === 404) {
        return null;
      }
      throw err;
    }
  }

  // Local filesystem fallback
  ensureStorageReady();
  const filePath = join(resolveUploadsDir(), filename);
  try {
    const buffer = await readFile(filePath);
    const contentType = getContentType(filename);
    return { buffer, contentType };
  } catch {
    return null;
  }
}
