import { createFamilyOsApiClient, parsePayloadArgument, runFamilyOsApiClientSelfTest } from "./family_os_api_client.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const workspace = path.resolve(scriptDir, "..");

function fail(message) {
  console.error(message);
  process.exit(1);
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? "" : process.argv[index + 1] || "";
}

async function readRequest() {
  if (process.argv.includes("--self-test")) {
    await runFamilyOsApiClientSelfTest();
    console.log("family_os_api_tool self-test passed.");
    process.exit(0);
  }

  const action = process.argv[2];
  if (!action || action.startsWith("--")) fail("Provide a Family OS action.");

  const payloadJson = argument("--payload-json");
  return {
    action,
    payload: payloadJson ? parsePayloadArgument(payloadJson) : {},
    request_text: argument("--request-text"),
  };
}

try {
  const client = createFamilyOsApiClient({
    workspace,
    actorId: "telegram_codex_bridge_direct_tool",
  });
  const data = await client.execute(await readRequest());
  console.log(JSON.stringify(data, null, 2));
} catch (error) {
  fail(String(error?.message || error));
}
