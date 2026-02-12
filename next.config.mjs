import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const getGitValue = (command) => {
  try {
    return execSync(command, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "";
  }
};

const readBuildMeta = () => {
  try {
    const metaPath = path.join(process.cwd(), "build-meta.json");
    if (!existsSync(metaPath)) return null;
    const content = readFileSync(metaPath, "utf8");
    const parsed = JSON.parse(content);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
};

const SLOT_SIZE = 101;
const buildMeta = readBuildMeta();
const envCommitCount = Number.parseInt(process.env.BUILD_COMMIT_COUNT ?? "", 10);
const gitCommitCount = Number.parseInt(getGitValue("git rev-list --count HEAD"), 10);
const metaCommitCount =
  buildMeta && typeof buildMeta.commitCount === "number" ? buildMeta.commitCount : Number.NaN;
const commitCount =
  Number.isFinite(envCommitCount) && envCommitCount >= 0
    ? envCommitCount
    : Number.isFinite(gitCommitCount) && gitCommitCount > 1
    ? gitCommitCount
    : Number.isFinite(metaCommitCount) && metaCommitCount >= 0
    ? metaCommitCount
    : Number.isFinite(gitCommitCount) && gitCommitCount >= 0
    ? gitCommitCount
    : 0;
const commitDate = getGitValue("git log -1 --format=%cI")
  || process.env.BUILD_COMMIT_DATE
  || (buildMeta && typeof buildMeta.commitDate === "string" ? buildMeta.commitDate : "");
const slotsPerMajor = SLOT_SIZE * SLOT_SIZE;
const versionMajor = 1 + Math.floor(commitCount / slotsPerMajor);
const remainder = commitCount % slotsPerMajor;
const versionMinor = Math.floor(remainder / SLOT_SIZE);
const versionPatch = remainder % SLOT_SIZE;
const versionString = `v.${versionMajor}.${versionMinor}.${versionPatch}`;

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_COMMIT_DATE: commitDate,
    NEXT_PUBLIC_COMMIT_VERSION: versionString,
  },
  async rewrites() {
    return [
      {
        source: "/infinarenapanel",
        destination: "/admin",
      },
      {
        source: "/infinarenapanel/:path*",
        destination: "/admin/:path*",
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
