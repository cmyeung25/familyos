import fs from "node:fs";
import path from "node:path";
import { resolveFamilyOsPaths } from "../family-os-telegram-bot/instance_paths.mjs";

const DEFAULT_BOT_MAX_AGE_MS = 3 * 60 * 1000;
const DEFAULT_REMINDER_MAX_AGE_MS = 20 * 60 * 1000;

export function getContainerHealthSnapshot({
  mode = process.env.FAMILY_OS_HEALTHCHECK_MODE || process.env.FAMILY_OS_SERVICE_MODE || "bot",
  botMaxAgeMs = Number(process.env.FAMILY_OS_BOT_HEALTH_MAX_AGE_MS || DEFAULT_BOT_MAX_AGE_MS),
  reminderMaxAgeMs = Number(process.env.FAMILY_OS_REMINDER_HEALTH_MAX_AGE_MS || DEFAULT_REMINDER_MAX_AGE_MS),
} = {}) {
  const normalizedMode = normalizeMode(mode);
  const paths = resolveFamilyOsPaths();
  return readHealthSnapshot({
    instanceName: path.basename(paths.instanceRoot),
    serviceMode: normalizedMode,
    filePath: normalizedMode === "reminder" ? paths.reminderStatePath : paths.botHeartbeatPath,
    maxAgeMs: normalizedMode === "reminder" ? reminderMaxAgeMs : botMaxAgeMs,
    timestampKeys: normalizedMode === "reminder" ? ["last_run_at", "timestamp"] : ["timestamp", "last_run_at"],
  });
}

export function getNamedInstanceHealthSnapshot({
  instanceName,
  instanceRoot,
  mode,
  botMaxAgeMs = DEFAULT_BOT_MAX_AGE_MS,
  reminderMaxAgeMs = DEFAULT_REMINDER_MAX_AGE_MS,
}) {
  const normalizedMode = normalizeMode(mode);
  const resolvedRoot = path.resolve(instanceRoot);
  const stateRoot = path.join(resolvedRoot, "state");
  return readHealthSnapshot({
    instanceName: String(instanceName || path.basename(resolvedRoot) || "instance"),
    serviceMode: normalizedMode,
    filePath: normalizedMode === "reminder"
      ? path.join(stateRoot, "reminder-state.json")
      : path.join(stateRoot, "bot-heartbeat.json"),
    maxAgeMs: normalizedMode === "reminder" ? reminderMaxAgeMs : botMaxAgeMs,
    timestampKeys: normalizedMode === "reminder" ? ["last_run_at", "timestamp"] : ["timestamp", "last_run_at"],
  });
}

export function assertHealthy(snapshot) {
  if (!snapshot?.ok) {
    throw new Error(snapshot?.error || "Healthcheck failed.");
  }
}

function readHealthSnapshot({ instanceName, serviceMode, filePath, maxAgeMs, timestampKeys }) {
  const baseSnapshot = {
    ok: false,
    instance: instanceName,
    service: serviceMode,
    file_path: filePath,
    max_age_ms: maxAgeMs,
  };

  if (!fs.existsSync(filePath)) {
    return {
      ...baseSnapshot,
      error: `Healthcheck file is missing: ${filePath}`,
      http_status: 503,
    };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const timestampValue = firstDefinedValue(parsed, timestampKeys);
    const timestamp = new Date(String(timestampValue || ""));
    if (Number.isNaN(timestamp.getTime())) {
      return {
        ...baseSnapshot,
        raw: parsed,
        error: `Healthcheck timestamp is invalid: ${filePath}`,
        http_status: 503,
      };
    }

    const ageMs = Date.now() - timestamp.getTime();
    const ok = ageMs <= maxAgeMs;
    return {
      ...baseSnapshot,
      ok,
      http_status: ok ? 200 : 503,
      timestamp: timestamp.toISOString(),
      age_ms: ageMs,
      status: String(parsed.status || serviceMode),
      pid: Number(parsed.pid || 0) || null,
      raw: parsed,
      error: ok ? "" : `Healthcheck timestamp is stale: ${filePath}`,
    };
  } catch (error) {
    return {
      ...baseSnapshot,
      error: `Healthcheck read failed: ${error.message}`,
      http_status: 503,
    };
  }
}

function normalizeMode(mode) {
  const normalized = String(mode || "bot").trim().toLowerCase();
  return normalized === "reminder" ? "reminder" : "bot";
}

function firstDefinedValue(source, keys) {
  for (const key of keys) {
    if (source && source[key] !== undefined && source[key] !== null && String(source[key]).trim()) {
      return source[key];
    }
  }
  return "";
}
