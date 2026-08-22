import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { extname, join, normalize, relative } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(__dirname, "public");
const port = Number(process.env.FAMILY_OS_BB_IPAD_PORT || process.env.PORT || 8787);
const apiUrl = process.env.FAMILY_OS_API_URL || "";
const apiKey = process.env.FAMILY_OS_API_KEY || "";
// This is the concrete route implemented by this server, not a user-controlled label.
const dataPath = Object.freeze({ api: "apps_script", storage: "google_sheets" });

const allowedActions = new Set([
  "health",
  "get_recent_baby_logs",
  "query_baby_logs",
  "append_baby_log",
  "update_baby_log",
  "delete_baby_log",
]);

function securityHeaders() {
  return {
    "Content-Security-Policy": "default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  };
}

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".webmanifest", "application/manifest+json; charset=utf-8"],
  [".svg", "image/svg+xml; charset=utf-8"],
  [".png", "image/png"],
  [".ico", "image/x-icon"],
]);

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
        reject(new Error("Request body too large."));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

async function callFamilyOsApi(action, payload = {}, requestText = "") {
  if (!apiUrl || !apiKey) {
    const error = new Error("FAMILY_OS_API_URL and FAMILY_OS_API_KEY are required.");
    error.statusCode = 503;
    throw error;
  }

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      action,
      payload,
      request_text: requestText || "iPad BB App",
    }),
  });

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    const error = new Error(`Family OS API returned non-JSON response (${response.status}).`);
    error.statusCode = 502;
    throw error;
  }

  if (!response.ok || data.ok !== true) {
    const error = new Error(data.error || `Family OS API request failed (${response.status}).`);
    error.statusCode = response.ok ? 502 : response.status;
    throw error;
  }

  return data;
}

function staticPathFromUrl(url) {
  const pathname = decodeURIComponent(new URL(url, "http://localhost").pathname);
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const filePath = normalize(join(publicDir, safePath));
  const rel = relative(publicDir, filePath);
  if (rel.startsWith("..") || rel === "" || rel.includes("..\\")) {
    return null;
  }
  return filePath;
}

async function serveStatic(req, res) {
  const filePath = staticPathFromUrl(req.url);
  if (!filePath) {
    sendJson(res, 400, { ok: false, error: "Invalid path." });
    return;
  }

  try {
    await readFile(filePath);
  } catch {
    if (req.url.startsWith("/assets/") || req.url.includes(".")) {
      sendJson(res, 404, { ok: false, error: "Not found." });
      return;
    }
    req.url = "/";
    await serveStatic(req, res);
    return;
  }

  const contentType = mimeTypes.get(extname(filePath)) || "application/octet-stream";
  const isShell = filePath.endsWith("index.html");
  const staticRel = relative(publicDir, filePath).replace(/\\/g, "/");
  const isRevalidatedShellAsset = isShell || staticRel === "service-worker.js" || ["app.js", "styles.css", "manifest.webmanifest"].includes(staticRel);
  res.writeHead(200, {
    ...securityHeaders(),
    "Content-Type": contentType,
    "Cache-Control": isRevalidatedShellAsset ? "no-cache" : "public, max-age=3600",
  });
  createReadStream(filePath).pipe(res);
}

async function handleApi(req, res) {
  try {
    if (req.method === "GET" && req.url === "/api/health") {
      const data = await callFamilyOsApi("health", {}, "iPad BB App health check");
      sendJson(res, 200, {
        ...data,
        result: {
          ...(data.result || {}),
          data_path: dataPath,
        },
      });
      return;
    }

    if (req.method !== "POST" || req.url !== "/api/family-os") {
      sendJson(res, 404, { ok: false, error: "Unknown API route." });
      return;
    }

    const raw = await readBody(req);
    const request = raw ? JSON.parse(raw) : {};
    const action = String(request.action || "");
    if (!allowedActions.has(action)) {
      sendJson(res, 400, { ok: false, error: `Unsupported action: ${action}` });
      return;
    }

    const data = await callFamilyOsApi(action, request.payload || {}, request.request_text || "");
    sendJson(res, 200, data);
  } catch (error) {
    sendJson(res, error.statusCode || 500, {
      ok: false,
      error: error.message || "Unexpected server error.",
    });
  }
}

const server = createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/healthz") {
    sendJson(res, 200, {
      ok: true,
      service: "family-os-bb-ipad",
      api_configured: Boolean(apiUrl && apiKey),
    });
    return;
  }

  if (req.url.startsWith("/api/")) {
    await handleApi(req, res);
    return;
  }
  await serveStatic(req, res);
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Family OS BB iPad app listening on http://localhost:${port}`);
});
