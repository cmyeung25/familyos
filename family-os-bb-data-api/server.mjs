import { createServer } from "node:http";
import { ApiError, assertApiKey, config, databaseHealth, runAction } from "./lib.mjs";

function securityHeaders() {
  return {
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  };
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    ...securityHeaders(),
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(new ApiError("Request body too large.", 413));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/healthz") {
      const databaseOk = await databaseHealth();
      sendJson(res, databaseOk ? 200 : 503, {
        ok: databaseOk,
        service: "family-os-bb-data-api",
        database: databaseOk ? "reachable" : "unreachable",
      });
      return;
    }
    if (req.method !== "POST" || req.url !== "/v1/actions") {
      sendJson(res, 404, { ok: false, error: "Unknown API route." });
      return;
    }
    const raw = await readBody(req);
    let request;
    try {
      request = raw ? JSON.parse(raw) : {};
    } catch {
      throw new ApiError("Request body must be valid JSON.");
    }
    assertApiKey(request.api_key);
    const result = await runAction(request.action, request.payload || {}, request.request_text || "");
    sendJson(res, 200, { ok: true, result });
  } catch (error) {
    const status = error instanceof ApiError ? error.statusCode : 500;
    sendJson(res, status, { ok: false, error: error.message || "Unexpected server error." });
  }
});

server.listen(config.port, "0.0.0.0", () => {
  console.log(`Family OS BB Data API listening on http://0.0.0.0:${config.port}`);
});
