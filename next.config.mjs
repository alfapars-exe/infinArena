import { execSync } from "node:child_process";

const getGitValue = (command) => {
  try {
    return execSync(command, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "";
  }
};

const SLOT_SIZE = 101;
const rawCommitCount = Number.parseInt(getGitValue("git rev-list --count HEAD"), 10);
const commitCount = Number.isFinite(rawCommitCount) && rawCommitCount >= 0 ? rawCommitCount : 0;
const commitDate = getGitValue("git log -1 --format=%cI");
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
