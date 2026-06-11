import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultWorkspaceRoot = path.resolve(scriptDir, "..");
const defaultRuntimeConfigPath = path.join(
  defaultWorkspaceRoot,
  "plugins-staging",
  "family-os-bb-inventory",
  "runtime",
  "telegram-runtime.json",
);

function resolvePath(value, fallback, { baseDir = defaultWorkspaceRoot } = {}) {
  const candidate = String(value || "").trim();
  const input = candidate || fallback;
  if (path.isAbsolute(input)) {
    return path.normalize(input);
  }
  return path.resolve(baseDir, input);
}

export function resolveFamilyOsPaths() {
  const workspaceRoot = resolvePath(
    process.env.FAMILY_OS_WORKSPACE,
    defaultWorkspaceRoot,
    { baseDir: defaultWorkspaceRoot },
  );
  const instanceRoot = resolvePath(
    process.env.FAMILY_OS_INSTANCE_ROOT,
    scriptDir,
    { baseDir: workspaceRoot },
  );
  const configRoot = resolvePath(
    process.env.FAMILY_OS_CONFIG_ROOT,
    instanceRoot,
    { baseDir: workspaceRoot },
  );
  const stateRoot = resolvePath(
    process.env.FAMILY_OS_STATE_ROOT,
    instanceRoot,
    { baseDir: workspaceRoot },
  );
  const logsRoot = resolvePath(
    process.env.FAMILY_OS_LOGS_ROOT,
    instanceRoot,
    { baseDir: workspaceRoot },
  );
  const codexHome = resolvePath(
    process.env.FAMILY_OS_CODEX_HOME || process.env.CODEX_HOME,
    path.join(instanceRoot, ".codex-home"),
    { baseDir: workspaceRoot },
  );
  const skillsRoot = resolvePath(
    process.env.FAMILY_OS_SKILLS_ROOT,
    path.join(workspaceRoot, ".agents", "skills"),
    { baseDir: workspaceRoot },
  );
  const runtimeConfigPath = resolvePath(
    process.env.FAMILY_OS_RUNTIME_CONFIG_PATH,
    defaultRuntimeConfigPath,
    { baseDir: workspaceRoot },
  );

  return {
    scriptDir,
    workspaceRoot,
    instanceRoot,
    configRoot,
    stateRoot,
    logsRoot,
    codexHome,
    skillsRoot,
    runtimeConfigPath,
    botConfigPath: resolvePath(
      process.env.FAMILY_OS_BOT_CONFIG_PATH,
      path.join(configRoot, "local-bot-config.json"),
      { baseDir: workspaceRoot },
    ),
    apiConfigPath: resolvePath(
      process.env.FAMILY_OS_API_CONFIG_PATH,
      path.join(workspaceRoot, "family-os-apps-script", "local-api-config.json"),
      { baseDir: workspaceRoot },
    ),
    reminderConfigPath: resolvePath(
      process.env.FAMILY_OS_REMINDER_CONFIG_PATH,
      path.join(configRoot, "reminder-config.json"),
      { baseDir: workspaceRoot },
    ),
    bridgeStatePath: resolvePath(
      process.env.FAMILY_OS_BRIDGE_STATE_PATH,
      path.join(stateRoot, ".codex-bridge-state.json"),
      { baseDir: workspaceRoot },
    ),
    bridgeErrorLogPath: resolvePath(
      process.env.FAMILY_OS_BRIDGE_ERROR_LOG_PATH,
      path.join(logsRoot, "bridge-error.log"),
      { baseDir: workspaceRoot },
    ),
    botLockPath: resolvePath(
      process.env.FAMILY_OS_BOT_LOCK_PATH,
      path.join(stateRoot, "bot.lock"),
      { baseDir: workspaceRoot },
    ),
    botActivityLogPath: resolvePath(
      process.env.FAMILY_OS_BOT_ACTIVITY_LOG_PATH,
      path.join(logsRoot, "bot-activity.log"),
      { baseDir: workspaceRoot },
    ),
    botFatalLogPath: resolvePath(
      process.env.FAMILY_OS_BOT_FATAL_LOG_PATH,
      path.join(logsRoot, "bot-fatal.log"),
      { baseDir: workspaceRoot },
    ),
    botStartupDebugLogPath: resolvePath(
      process.env.FAMILY_OS_BOT_STARTUP_DEBUG_LOG_PATH,
      path.join(logsRoot, "bot-startup-debug.log"),
      { baseDir: workspaceRoot },
    ),
    botRuntimeStatePath: resolvePath(
      process.env.FAMILY_OS_BOT_RUNTIME_STATE_PATH,
      path.join(stateRoot, "bot-runtime-state.json"),
      { baseDir: workspaceRoot },
    ),
    botHeartbeatPath: resolvePath(
      process.env.FAMILY_OS_BOT_HEARTBEAT_PATH,
      path.join(stateRoot, "bot-heartbeat.json"),
      { baseDir: workspaceRoot },
    ),
    reminderStatePath: resolvePath(
      process.env.FAMILY_OS_REMINDER_STATE_PATH,
      path.join(stateRoot, "reminder-state.json"),
      { baseDir: workspaceRoot },
    ),
    reminderLockPath: resolvePath(
      process.env.FAMILY_OS_REMINDER_LOCK_PATH,
      path.join(stateRoot, "reminder-worker.lock"),
      { baseDir: workspaceRoot },
    ),
    reminderActivityLogPath: resolvePath(
      process.env.FAMILY_OS_REMINDER_ACTIVITY_LOG_PATH,
      path.join(logsRoot, "reminder-worker-activity.log"),
      { baseDir: workspaceRoot },
    ),
    reminderFatalLogPath: resolvePath(
      process.env.FAMILY_OS_REMINDER_FATAL_LOG_PATH,
      path.join(logsRoot, "reminder-worker-fatal.log"),
      { baseDir: workspaceRoot },
    ),
    reminderSupervisorStatePath: resolvePath(
      process.env.FAMILY_OS_REMINDER_SUPERVISOR_STATE_PATH,
      path.join(stateRoot, "reminder-supervisor-state.json"),
      { baseDir: workspaceRoot },
    ),
    reminderSupervisorLogPath: resolvePath(
      process.env.FAMILY_OS_REMINDER_SUPERVISOR_LOG_PATH,
      path.join(logsRoot, "reminder-supervisor.log"),
      { baseDir: workspaceRoot },
    ),
    reminderWorkerRunLogPath: resolvePath(
      process.env.FAMILY_OS_REMINDER_WORKER_RUN_LOG_PATH,
      path.join(logsRoot, "reminder-worker-run.log"),
      { baseDir: workspaceRoot },
    ),
    botSupervisorStatePath: resolvePath(
      process.env.FAMILY_OS_BOT_SUPERVISOR_STATE_PATH,
      path.join(stateRoot, "bot-supervisor-state.json"),
      { baseDir: workspaceRoot },
    ),
    botSupervisorLogPath: resolvePath(
      process.env.FAMILY_OS_BOT_SUPERVISOR_LOG_PATH,
      path.join(logsRoot, "bot-supervisor.log"),
      { baseDir: workspaceRoot },
    ),
    botSupervisorOutPath: resolvePath(
      process.env.FAMILY_OS_BOT_SUPERVISOR_OUT_PATH,
      path.join(logsRoot, "bot-supervisor.out.log"),
      { baseDir: workspaceRoot },
    ),
    botSupervisorErrPath: resolvePath(
      process.env.FAMILY_OS_BOT_SUPERVISOR_ERR_PATH,
      path.join(logsRoot, "bot-supervisor.err.log"),
      { baseDir: workspaceRoot },
    ),
    botRuntimeOutPath: resolvePath(
      process.env.FAMILY_OS_BOT_RUNTIME_OUT_PATH,
      path.join(logsRoot, "bot-runtime.out.log"),
      { baseDir: workspaceRoot },
    ),
    botRuntimeErrPath: resolvePath(
      process.env.FAMILY_OS_BOT_RUNTIME_ERR_PATH,
      path.join(logsRoot, "bot-runtime.err.log"),
      { baseDir: workspaceRoot },
    ),
    botWatchdogLogPath: resolvePath(
      process.env.FAMILY_OS_BOT_WATCHDOG_LOG_PATH,
      path.join(logsRoot, "bot-watchdog.log"),
      { baseDir: workspaceRoot },
    ),
  };
}

export function ensureParentDirectory(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

export function ensureRuntimeDirectories(paths) {
  for (const dirPath of [
    paths.instanceRoot,
    paths.configRoot,
    paths.stateRoot,
    paths.logsRoot,
    paths.codexHome,
    path.dirname(paths.skillsRoot),
  ]) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}
