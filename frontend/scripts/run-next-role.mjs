import { spawn } from "node:child_process";

const [, , modeArg, roleArg, portArg] = process.argv;

const mode = modeArg === "start" ? "start" : "dev";
const role = roleArg === "admin" || roleArg === "player" ? roleArg : "all";
const defaultPort = role === "player" ? "3001" : "3000";
const port = portArg || process.env.PORT || defaultPort;

const env = {
  ...process.env,
  FRONTEND_ROLE: role,
  PORT: port,
};

const isWindows = process.platform === "win32";
const command = isWindows ? "cmd.exe" : "pnpm";
const args = isWindows
  ? ["/d", "/s", "/c", `pnpm exec next ${mode} -p ${port}`]
  : ["exec", "next", mode, "-p", port];

const child = spawn(command, args, { env, stdio: "inherit" });

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
