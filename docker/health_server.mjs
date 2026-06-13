import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { getNamedInstanceHealthSnapshot } from "./health_state.mjs";

const isSelfTest = process.argv.includes("--self-test");

if (isSelfTest) {
  runSelfTest();
  process.exit(0);
}

const monitorConfig = {
  bind: String(process.env.FAMILY_OS_MONITOR_BIND || "0.0.0.0").trim() || "0.0.0.0",
  port: Number(process.env.FAMILY_OS_MONITOR_PORT || 8787) || 8787,
  token: String(process.env.FAMILY_OS_MONITOR_TOKEN || "").trim(),
  instances: parseMonitoredInstances(process.env.FAMILY_OS_MONITOR_INSTANCES || ""),
  botMaxAgeMs: Number(process.env.FAMILY_OS_BOT_HEALTH_MAX_AGE_MS || 3 * 60 * 1000),
  reminderMaxAgeMs: Number(process.env.FAMILY_OS_REMINDER_HEALTH_MAX_AGE_MS || 20 * 60 * 1000),
};

if (monitorConfig.instances.length === 0) {
  throw new Error("FAMILY_OS_MONITOR_INSTANCES is required. Example: gary=/data/instances/gary,brother=/data/instances/brother");
}

const server = http.createServer((request, response) => {
  const requestUrl = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  if (!isAuthorized(request, requestUrl, monitorConfig.token)) {
    writeJson(response, 401, { ok: false, error: "Unauthorized." });
    return;
  }

  try {
    const payload = buildResponsePayload(requestUrl.pathname, monitorConfig);
    writeJson(response, payload.http_status, payload.body);
  } catch (error) {
    writeJson(response, 500, {
      ok: false,
      error: String(error.message || error),
    });
  }
});

server.listen(monitorConfig.port, monitorConfig.bind, () => {
  console.log(`Family OS health monitor listening on ${monitorConfig.bind}:${monitorConfig.port}`);
});

function buildResponsePayload(pathname, config) {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) {
    return {
      http_status: 200,
      body: {
        ok: true,
        service: "familyos-monitor",
        endpoints: [
          "/healthz",
          "/healthz/{instance}",
          "/healthz/{instance}/bot",
          "/healthz/{instance}/reminder",
        ],
      },
    };
  }

  if (segments[0] !== "healthz") {
    return {
      http_status: 404,
      body: { ok: false, error: "Not found." },
    };
  }

  if (segments.length === 1) {
    const summary = config.instances.map((entry) => buildInstanceSummary(entry, config));
    const ok = summary.every((entry) => entry.ok);
    return {
      http_status: ok ? 200 : 503,
      body: {
        ok,
        instances: summary,
      },
    };
  }

  const instance = config.instances.find((entry) => entry.name === segments[1]);
  if (!instance) {
    return {
      http_status: 404,
      body: { ok: false, error: `Unknown instance: ${segments[1]}` },
    };
  }

  if (segments.length === 2) {
    const summary = buildInstanceSummary(instance, config);
    return {
      http_status: summary.ok ? 200 : 503,
      body: summary,
    };
  }

  const service = normalizeMode(segments[2]);
  if (!service) {
    return {
      http_status: 404,
      body: { ok: false, error: `Unknown service: ${segments[2]}` },
    };
  }

  const snapshot = buildServiceSnapshot(instance, service, config);
  return {
    http_status: snapshot.http_status,
    body: snapshot,
  };
}

function buildInstanceSummary(instance, config) {
  const bot = buildServiceSnapshot(instance, "bot", config);
  const reminder = buildServiceSnapshot(instance, "reminder", config);
  return {
    ok: bot.ok && reminder.ok,
    instance: instance.name,
    root: instance.root,
    services: {
      bot,
      reminder,
    },
  };
}

function buildServiceSnapshot(instance, service, config) {
  return getNamedInstanceHealthSnapshot({
    instanceName: instance.name,
    instanceRoot: instance.root,
    mode: service,
    botMaxAgeMs: config.botMaxAgeMs,
    reminderMaxAgeMs: config.reminderMaxAgeMs,
  });
}

function parseMonitoredInstances(value) {
  return String(value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const separatorIndex = entry.indexOf("=");
      if (separatorIndex <= 0 || separatorIndex === entry.length - 1) {
        throw new Error(`Invalid FAMILY_OS_MONITOR_INSTANCES entry: ${entry}`);
      }
      return {
        name: entry.slice(0, separatorIndex).trim(),
        root: path.resolve(entry.slice(separatorIndex + 1).trim()),
      };
    })
    .filter((entry) => entry.name && entry.root);
}

function isAuthorized(request, requestUrl, token) {
  if (!token) return true;
  const headerValue = String(request.headers["x-family-os-monitor-token"] || "").trim();
  const queryValue = String(requestUrl.searchParams.get("token") || "").trim();
  return headerValue === token || queryValue === token;
}

function normalizeMode(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "bot" || normalized === "reminder") {
    return normalized;
  }
  return "";
}

function writeJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  response.end(`${JSON.stringify(payload, null, 2)}\n`);
}

function runSelfTest() {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "familyos-health-"));
  const instanceRoot = path.join(tmpRoot, "gary");
  const stateRoot = path.join(instanceRoot, "state");
  fs.mkdirSync(stateRoot, { recursive: true });

  fs.writeFileSync(path.join(stateRoot, "bot-heartbeat.json"), JSON.stringify({
    pid: 123,
    status: "polling",
    timestamp: new Date().toISOString(),
  }), "utf8");
  fs.writeFileSync(path.join(stateRoot, "reminder-state.json"), JSON.stringify({
    version: 1,
    last_run_at: new Date().toISOString(),
  }), "utf8");

  const config = {
    botMaxAgeMs: 180000,
    reminderMaxAgeMs: 1200000,
    instances: [{ name: "gary", root: instanceRoot }],
  };

  assert.deepEqual(
    parseMonitoredInstances("gary=/data/gary,brother=/data/brother").map((entry) => entry.name),
    ["gary", "brother"],
  );

  const summaryPayload = buildResponsePayload("/healthz/gary", config);
  assert.equal(summaryPayload.http_status, 200);
  assert.equal(summaryPayload.body.ok, true);
  assert.equal(summaryPayload.body.services.bot.ok, true);

  const staleSnapshot = getNamedInstanceHealthSnapshot({
    instanceName: "gary",
    instanceRoot,
    mode: "bot",
    botMaxAgeMs: -1,
  });
  assert.equal(staleSnapshot.ok, false);

  const notFoundPayload = buildResponsePayload("/healthz/unknown", config);
  assert.equal(notFoundPayload.http_status, 404);

  console.log("Family OS health monitor self-test passed.");
}
