import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createFamilyOsApiClient,
  parsePayloadArgument,
} from "../../../../../family-os-telegram-bot/family_os_api_client.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const workspace = path.resolve(scriptDir, "..", "..", "..", "..", "..");
const allowedActions = new Set([
  "health",
  "get_inventory_snapshot",
  "get_low_stock_items",
  "record_inventory_purchase_batch",
  "record_inventory_consume_batch",
  "upsert_inventory_item",
  "set_inventory_stock_level",
  "update_inventory_expiry_date",
  "get_recent_baby_logs",
  "append_baby_log",
  "query_bb_calendar_events",
  "append_bb_calendar_event",
  "append_task",
  "update_task",
  "query_tasks",
  "get_upcoming_tasks",
  "get_overdue_tasks",
  "get_task_context_hints",
  "append_household_memory",
  "query_household_memory",
]);

const batchInventoryActions = new Set([
  "record_inventory_purchase_batch",
  "record_inventory_consume_batch",
]);

function fail(message) {
  console.error(message);
  process.exit(1);
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? "" : process.argv[index + 1] || "";
}

function readRequest() {
  if (process.argv.includes("--self-test")) {
    if (!allowedActions.has("append_baby_log") || !allowedActions.has("set_inventory_stock_level") || !allowedActions.has("update_inventory_expiry_date") || !allowedActions.has("append_task") || !allowedActions.has("query_bb_calendar_events") || !allowedActions.has("append_bb_calendar_event") || !allowedActions.has("get_task_context_hints") || !allowedActions.has("append_household_memory") || !allowedActions.has("query_household_memory")) {
      throw new Error("Allowed action self-test failed.");
    }
    const payload = parsePayloadArgument("{\"log_type\":\"feeding\",\"value_number\":90,\"unit\":\"ml\"}");
    if (payload.log_type !== "feeding" || payload.value_number !== 90) {
      throw new Error("Payload parsing self-test failed.");
    }
    const wrappedBatchPayload = normalizeActionPayload(
      "record_inventory_consume_batch",
      parsePayloadArgument("[{\"item_name\":\"雞蛋\",\"quantity\":1,\"unit\":\"隻\"}]"),
    );
    if (!Array.isArray(wrappedBatchPayload.items) || wrappedBatchPayload.items[0]?.item_name !== "雞蛋") {
      throw new Error("Batch payload wrapping self-test failed.");
    }
    console.log("family_os_bb_inventory_api_client self-test passed.");
    process.exit(0);
  }

  const action = process.argv[2];
  if (!action || action.startsWith("--")) fail("Provide a Family OS BB + inventory + task action.");
  if (!allowedActions.has(action)) fail(`Action is not allowed in the BB + inventory + task runtime: ${action}`);

  const payloadJson = argument("--payload-json");
  return {
    action,
    payload: normalizeActionPayload(action, payloadJson ? parsePayloadArgument(payloadJson) : {}),
    request_text: argument("--request-text"),
  };
}

function normalizeActionPayload(action, payload) {
  if (!batchInventoryActions.has(action)) {
    return payload;
  }
  if (Array.isArray(payload)) {
    return { items: payload };
  }
  return payload;
}

try {
  const client = createFamilyOsApiClient({
    workspace,
    actorId: "telegram_codex_v2",
  });
  const data = await client.execute(readRequest());
  console.log(JSON.stringify(data, null, 2));
} catch (error) {
  fail(String(error?.message || error));
}
