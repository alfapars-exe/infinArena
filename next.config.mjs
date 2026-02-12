import { execSync } from "node:child_process";

const getGitValue = (command) => {
  try {
    return execSync(command, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "";
  }
};

const rawCommitCount = Number.parseInt(getGitValue("git rev-list --count HEAD"), 10);
const commitCount = Number.isFinite(rawCommitCount) && rawCommitCount > 0 ? rawCommitCount : 0;
const commitDate = getGitValue("git log -1 --format=%cI");
const versionMinor = Math.floor(commitCount / 101);
const versionPatch = commitCount % 101;
const versionString = `v.1.${versionMinor}.${versionPatch}`;

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
