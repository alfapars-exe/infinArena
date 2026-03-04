import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";

function getGitValue(command) {
  try {
    return execSync(command, { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return "";
  }
}

const rawCommitCount = Number.parseInt(getGitValue("git rev-list --count HEAD"), 10);
const currentCommitCount = Number.isFinite(rawCommitCount) && rawCommitCount >= 0 ? rawCommitCount : 0;
const useNextCommit = process.argv.includes("--next");
const commitCount = currentCommitCount + (useNextCommit ? 1 : 0);
const commitDate = useNextCommit ? new Date().toISOString() : getGitValue("git log -1 --format=%cI");
const commitSha = getGitValue("git rev-parse HEAD");

const payload = {
  commitCount,
  commitDate,
  commitSha,
  generatedAt: new Date().toISOString(),
};

writeFileSync("build-meta.json", `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log("build-meta.json updated", payload);
