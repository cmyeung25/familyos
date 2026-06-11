import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const serviceMode = String(process.argv[2] || process.env.FAMILY_OS_SERVICE_MODE || "bot").trim().toLowerCase();
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultAppRoot = path.resolve(scriptDir, "..");
const appRoot = path.resolve(process.env.FAMILY_OS_WORKSPACE || defaultAppRoot);
const botRoot = path.join(appRoot, "family-os-telegram-bot");
const defaultInstanceRoot = path.resolve(process.env.FAMILY_OS_INSTANCE_ROOT || path.join(defaultAppRoot, "instances", "example"));
const defaultConfigRoot = path.resolve(process.env.FAMILY_OS_CONFIG_ROOT || path.join(defaultInstanceRoot, "config"));
const defaultStateRoot = path.resolve(process.env.FAMILY_OS_STATE_ROOT || path.join(defaultInstanceRoot, "state"));
const defaultLogsRoot = path.resolve(process.env.FAMILY_OS_LOGS_ROOT || path.join(defaultInstanceRoot, "logs"));
const defaultCodexHome = path.resolve(process.env.FAMILY_OS_CODEX_HOME || path.join(defaultInstanceRoot, ".codex-home"));
const defaultSkillsRoot = path.resolve(process.env.FAMILY_OS_SKILLS_ROOT || path.join(appRoot, ".agents", "skills"));
const defaultExampleRoot = path.join(appRoot, "instances", "example");
const defaultRuntimeConfigPath = path.join(appRoot, "plugins-staging", "family-os-bb-inventory", "runtime", "telegram-runtime.json");
const legacyBotReminderConfigPath = path.join(botRoot, "reminder-config.json");
const defaultReminderConfigPath = path.join(defaultExampleRoot, "config", "reminder-config.example.json");

initializeEnvironment();
ensureDirectories();

switch (serviceMode) {
  case "bot":
    await syncSkillsIfEnabled();
    await runNodeScript("bot.mjs", { nodeArgs: ["--use-system-ca"] });
    break;
  case "reminder":
    await runReminderLoop();
    break;
  case "sync-skills":
    await runNodeScript("sync_skills.mjs");
    break;
  case "bridge-self-test":
    await syncSkillsIfEnabled();
    await runNodeScript("codex_bridge.mjs", { scriptArgs: ["--self-test"] });
    break;
  case "bot-self-test":
    await syncSkillsIfEnabled();
    await runNodeScript("bot.mjs", { scriptArgs: ["--self-test"] });
    break;
  case "reminder-self-test":
    await runNodeScript("reminder_worker.mjs", { scriptArgs: ["--self-test"] });
    break;
  default:
    throw new Error(`Unsupported FAMILY_OS_SERVICE_MODE: ${serviceMode}`);
}

function initializeEnvironment() {
  process.env.FAMILY_OS_WORKSPACE = appRoot;
  process.env.FAMILY_OS_INSTANCE_ROOT = defaultInstanceRoot;
  process.env.FAMILY_OS_CONFIG_ROOT = defaultConfigRoot;
  process.env.FAMILY_OS_STATE_ROOT = defaultStateRoot;
  process.env.FAMILY_OS_LOGS_ROOT = defaultLogsRoot;
  process.env.FAMILY_OS_CODEX_HOME = defaultCodexHome;
  process.env.FAMILY_OS_SKILLS_ROOT = defaultSkillsRoot;
  process.env.CODEX_HOME = defaultCodexHome;
  process.env.FAMILY_OS_BOT_CONFIG_PATH = path.resolve(
    process.env.FAMILY_OS_BOT_CONFIG_PATH || path.join(defaultConfigRoot, "local-bot-config.json"),
  );
  process.env.FAMILY_OS_API_CONFIG_PATH = path.resolve(
    process.env.FAMILY_OS_API_CONFIG_PATH || path.join(defaultConfigRoot, "local-api-config.json"),
  );
  process.env.FAMILY_OS_RUNTIME_CONFIG_PATH = path.resolve(
    process.env.FAMILY_OS_RUNTIME_CONFIG_PATH
      || preferConfigFile("telegram-runtime.json", defaultRuntimeConfigPath),
  );
  process.env.FAMILY_OS_REMINDER_CONFIG_PATH = path.resolve(
    process.env.FAMILY_OS_REMINDER_CONFIG_PATH
      || preferConfigFile("reminder-config.json", defaultReminderConfigPath, {
        legacyFallbackPath: legacyBotReminderConfigPath,
      }),
  );
  process.env.PATH = `${path.join(botRoot, "node_modules", ".bin")}${path.delimiter}${process.env.PATH || ""}`;
}

function preferConfigFile(fileName, fallbackPath, { legacyFallbackPath = "" } = {}) {
  const candidate = path.join(defaultConfigRoot, fileName);
  if (fs.existsSync(candidate)) {
    return candidate;
  }
  if (legacyFallbackPath && fs.existsSync(legacyFallbackPath)) {
    return legacyFallbackPath;
  }
  return fallbackPath;
}

function ensureDirectories() {
  for (const dirPath of [
    defaultInstanceRoot,
    defaultConfigRoot,
    defaultStateRoot,
    defaultLogsRoot,
    defaultCodexHome,
    defaultSkillsRoot,
    path.join(defaultInstanceRoot, "memory"),
    path.join(defaultInstanceRoot, "runtime", "knowledge"),
  ]) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

async function syncSkillsIfEnabled() {
  if (process.env.FAMILY_OS_SKIP_SKILL_SYNC === "1") {
    return;
  }
  await runNodeScript("sync_skills.mjs");
}

async function runReminderLoop() {
  const intervalSeconds = Math.max(60, Number(process.env.FAMILY_OS_REMINDER_INTERVAL_SECONDS || 300) || 300);
  while (true) {
    await runNodeScript("reminder_worker.mjs", { nodeArgs: ["--use-system-ca"] });
    await sleep(intervalSeconds * 1000);
  }
}

function runNodeScript(scriptName, { nodeArgs = [], scriptArgs = [] } = {}) {
  const scriptPath = path.join(botRoot, scriptName);
  const args = [...nodeArgs, scriptPath, ...scriptArgs];
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: botRoot,
      env: process.env,
      stdio: "inherit",
    });

    const forwardSignal = (signal) => {
      if (!child.killed) {
        child.kill(signal);
      }
    };

    process.once("SIGINT", forwardSignal);
    process.once("SIGTERM", forwardSignal);

    child.on("error", (error) => {
      reject(error);
    });

    child.on("exit", (code, signal) => {
      process.removeListener("SIGINT", forwardSignal);
      process.removeListener("SIGTERM", forwardSignal);
      if (signal) {
        reject(new Error(`${scriptName} exited via signal ${signal}.`));
        return;
      }
      if (code !== 0) {
        reject(new Error(`${scriptName} exited with code ${code}.`));
        return;
      }
      resolve();
    });
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
