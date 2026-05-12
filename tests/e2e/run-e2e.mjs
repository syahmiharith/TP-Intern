import { spawn } from "node:child_process";
import { join } from "node:path";
import nextEnv from "@next/env";
import { startNextServer } from "./next-server.mjs";

const { loadEnvConfig } = nextEnv;
const projectDir = process.cwd();
const isLiveRun = process.argv.includes("--live");
const playwrightArgs = process.argv.slice(2).filter((arg) => arg !== "--live");

loadEnvConfig(projectDir);

if (!process.env.GEMINI_MODEL && process.env.GEMNI_MODEL) {
  process.env.GEMINI_MODEL = process.env.GEMNI_MODEL;
}

if (isLiveRun) {
  process.env.RUN_LIVE_GEMINI_E2E = "1";
}

const server = await startNextServer();
const playwrightCli = join(projectDir, "node_modules", "playwright", "cli.js");
const args = [playwrightCli, "test", ...playwrightArgs];
const childEnv = {
  ...process.env,
  PLAYWRIGHT_SKIP_WEB_SERVER: "1",
  RUN_LIVE_GEMINI_E2E: isLiveRun ? "1" : process.env.RUN_LIVE_GEMINI_E2E
};

if (process.env.GEMINI_API_KEY) {
  childEnv.GEMINI_API_KEY = process.env.GEMINI_API_KEY;
}

if (process.env.GEMINI_MODEL) {
  childEnv.GEMINI_MODEL = process.env.GEMINI_MODEL;
}

let exitCode = 1;

try {
  exitCode = await new Promise((resolve) => {
    const child = spawn(process.execPath, args, {
      env: childEnv,
      stdio: "inherit"
    });

    child.on("exit", (code) => {
      resolve(code ?? 1);
    });

    child.on("error", () => {
      resolve(1);
    });
  });
} finally {
  await server.close();
}

process.exit(exitCode);
