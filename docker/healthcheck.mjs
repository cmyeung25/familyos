import fs from "node:fs";
import { resolveFamilyOsPaths } from "../family-os-telegram-bot/instance_paths.mjs";

const mode = String(process.env.FAMILY_OS_HEALTHCHECK_MODE || process.env.FAMILY_OS_SERVICE_MODE || "bot").trim().toLowerCase();
const paths = resolveFamilyOsPaths();

if (mode === "reminder") {
  checkTimestampedJson(paths.reminderStatePath, Number(process.env.FAMILY_OS_REMINDER_HEALTH_MAX_AGE_MS || 20 * 60 * 1000));
} else {
  checkTimestampedJson(paths.botHeartbeatPath, Number(process.env.FAMILY_OS_BOT_HEALTH_MAX_AGE_MS || 3 * 60 * 1000));
}

function checkTimestampedJson(filePath, maxAgeMs) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Healthcheck file is missing: ${filePath}`);
  }
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const timestamp = new Date(String(parsed.timestamp || parsed.last_run_at || ""));
  if (Number.isNaN(timestamp.getTime())) {
    throw new Error(`Healthcheck timestamp is invalid: ${filePath}`);
  }
  if (Date.now() - timestamp.getTime() > maxAgeMs) {
    throw new Error(`Healthcheck timestamp is stale: ${filePath}`);
  }
}
