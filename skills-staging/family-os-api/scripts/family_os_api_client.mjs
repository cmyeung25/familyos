import fs from "node:fs";

function fail(message) {
  console.error(message);
  process.exit(1);
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? "" : process.argv[index + 1] || "";
}

function readRequest() {
  const requestFile = argument("--request-file");
  if (requestFile) return JSON.parse(fs.readFileSync(requestFile, "utf8"));

  const action = process.argv[2];
  if (!action || action.startsWith("--")) fail("Provide an action or --request-file.");

  const payloadJson = argument("--payload-json");
  return {
    action,
    payload: payloadJson ? JSON.parse(payloadJson) : {},
    request_text: argument("--request-text"),
  };
}

const url = process.env.FAMILY_OS_API_URL;
const apiKey = process.env.FAMILY_OS_API_KEY;
if (!url) fail("FAMILY_OS_API_URL is not configured.");
if (!apiKey) fail("FAMILY_OS_API_KEY is not configured.");

const request = readRequest();
const response = await fetch(url, {
  method: "POST",
  redirect: "follow",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    api_key: apiKey,
    action: request.action,
    payload: request.payload || {},
    request_text: request.request_text || "",
    actor_id: "codex",
  }),
});

const text = await response.text();
let data;
try {
  data = JSON.parse(text);
} catch {
  fail(`Family OS API returned non-JSON response (${response.status}).`);
}

if (!response.ok || !data.ok) {
  fail(data.error || `Family OS API failed (${response.status}).`);
}

console.log(JSON.stringify(data, null, 2));
