import { NextRequest, NextResponse } from "next/server";
import { writeFile } from "fs/promises";
import { join } from "path";
import { randomBytes } from "crypto";
import { ensureStorageReady, resolveUploadsDir } from "@/lib/storage";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed." },
        { status: 400 }
      );
    }

    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 5MB." },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const ext = file.name.split(".").pop() || "png";
    const uniqueName = `${randomBytes(16).toString("hex")}.${ext}`;

    ensureStorageReady();
    const uploadDir = resolveUploadsDir();
    const filePath = join(uploadDir, uniqueName);

    await writeFile(filePath, buffer);

    const url = `/api/uploads/${uniqueName}`;
    const absoluteUrl = new URL(url, request.nextUrl.origin).toString();
    return NextResponse.json({ url, absoluteUrl });
  } catch (err) {
    console.error("Upload error:", err);
    return NextResponse.json({ error: "Failed to upload file" }, { status: 500 });
  }
}
