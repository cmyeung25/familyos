import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { CodexBridge } from "./codex_bridge.mjs";

const workspace = path.resolve(process.cwd());
const bridge = new CodexBridge({
  workspace,
  statePath: path.join(os.tmpdir(), `familyos-dobby-regression-${process.pid}.json`),
  timeoutMs: 1000,
});

const commandLog = [];
const inventorySnapshot = [
  { item_id: "itm_white_pepper", item_name: "白胡椒粉", unit: "bottle", category: "groceries", quantity_on_hand: 1, safety_stock: 0 },
  { item_id: "itm_sesame_oil", item_name: "麻油", unit: "bottle", category: "groceries", quantity_on_hand: 0, safety_stock: 1 },
  { item_id: "itm_ketchup", item_name: "茄汁", unit: "bottle", category: "groceries", quantity_on_hand: 0, safety_stock: 1 },
  { item_id: "itm_oyster_sauce", item_name: "蠔油", unit: "bottle", category: "groceries", quantity_on_hand: 0.1, safety_stock: 0.2 },
  { item_id: "itm_vinegar", item_name: "醋", unit: "bottle", category: "groceries", quantity_on_hand: 0, safety_stock: 1 },
  { item_id: "itm_dark_soy_sauce", item_name: "老抽", unit: "bottle", category: "groceries", quantity_on_hand: 0, safety_stock: 1 },
  { item_id: "itm_chicken_bouillon", item_name: "雞粉", unit: "pack", category: "groceries", quantity_on_hand: 0, safety_stock: 1 },
  { item_id: "itm_noodles", item_name: "公仔麵", unit: "pack", category: "groceries", quantity_on_hand: 10, safety_stock: 3 },
  { item_id: "itm_egg", item_name: "雞蛋", unit: "piece", category: "groceries", quantity_on_hand: 6, safety_stock: 4 },
  { item_id: "itm_cheesecake", item_name: "芝士蛋糕", unit: "piece", category: "groceries", quantity_on_hand: 1, safety_stock: 0 },
  { item_id: "itm_sugar", item_name: "糖", unit: "pack", category: "groceries", quantity_on_hand: 0, safety_stock: 1 },
  { item_id: "itm_milk", item_name: "牛奶", unit: "bottle", category: "groceries", quantity_on_hand: 1, safety_stock: 1 },
];
const householdMemoryRows = [
  {
    memory_id: "mem_chair_tool",
    memory_type: "item_location",
    subject: "成長椅嘅工具",
    value_text: "放咗喺工具箱",
    location: "工具箱",
    status: "active",
  },
];
const openTasks = [
  {
    task_id: "tsk_shop_bathroom",
    task_name: "買廁所墊同乾洗頭水",
    category: "shopping",
    status: "open",
  },
];

bridge.executeBridgeCommand = (commandRequest) => {
  commandLog.push(commandRequest);
  const action = commandRequest?.argv?.[0] || "";
  if (action === "get_inventory_snapshot") {
    return ok(action, inventorySnapshot);
  }
  if (action === "append_household_memory") {
    const payload = payloadOf(commandRequest);
    return ok(action, {
      memory_id: "mem_new_location",
      ...payload,
    });
  }
  if (action === "append_bb_calendar_event") {
    const payload = payloadOf(commandRequest);
    return ok(action, {
      calendar_event: {
        calendar_event_id: "evt_bb_followup",
        title: payload.title,
        event_type: payload.event_type,
        start_at: payload.start_at,
        end_at: payload.start_at.replace("11:15:00", "12:15:00"),
        location: payload.location,
        description: payload.description,
      },
      task: {
        task_id: "tsk_bb_followup",
        task_name: payload.title,
        due_at: payload.start_at,
        status: "open",
        category: "medical",
      },
    });
  }
  if (action === "query_household_memory") {
    const payload = payloadOf(commandRequest);
    const subject = String(payload.subject || "").trim();
    return ok(action, householdMemoryRows.filter((row) => row.subject === subject));
  }
  if (action === "upsert_inventory_item") {
    const payload = payloadOf(commandRequest);
    return ok(action, {
      ...inventorySnapshot.find((row) => row.item_id === payload.item_id),
      ...payload,
    });
  }
  if (action === "record_inventory_purchase_batch") {
    const payload = payloadOf(commandRequest);
    return ok(action, {
      items: payload.items.map((item) => ({
        ...item,
        quantity_on_hand: Number(item.quantity || 0),
      })),
    });
  }
  if (action === "record_inventory_consume_batch") {
    const payload = payloadOf(commandRequest);
    return ok(action, {
      items: payload.items.map((item) => ({
        ...item,
        quantity_on_hand: 9,
      })),
    });
  }
  if (action === "query_tasks") {
    return ok(action, openTasks);
  }
  if (action === "update_task") {
    const payload = payloadOf(commandRequest);
    const task = openTasks.find((entry) => entry.task_id === payload.task_id) || {};
    return ok(action, {
      ...task,
      ...payload.patch,
      task_id: payload.task_id,
    });
  }
  return {
    ok: false,
    command_id: "bb_inventory_api",
    exit_code: 1,
    stdout: "",
    stderr: "",
    parsed_json: null,
    error: `Unexpected command in Dobby regression harness: ${action}`,
  };
};

assertContextPacket();
assertBbCalendarDirectPath();
assertHouseholdMemoryDirectPaths();
assertSafetyStockDirectPath();
assertSingleRestockDirectPath();
assertBatchRestockClarificationPath();
assertShoppingTaskDonePath();
assertConsumeDirectPath();

console.log("Dobby Intelligence Layer v1 regression passed.");

function assertContextPacket() {
  const memoryPrompt = bridge.buildFamilyOsAgentPrompt("成長椅嘅工具放咗去邊", "7476829331", {}, null);
  assert.match(memoryPrompt, /Dobby Intelligence Layer v1 context packet/);
  assert.match(memoryPrompt, /likely_domain: household_memory/);
  assert.match(memoryPrompt, /deterministic_candidate: household_memory_query/);

  const safetyPrompt = bridge.buildFamilyOsAgentPrompt("幫我設定返白胡椒粉嘅安全存量係一樽", "7476829331", {}, null);
  assert.match(safetyPrompt, /likely_domain: inventory/);
  assert.match(safetyPrompt, /deterministic_candidate: inventory_safety_stock/);

  const bbCalendarPrompt = bridge.buildFamilyOsAgentPrompt(bbCalendarAppointmentText(), "7476829331", {}, null);
  assert.match(bbCalendarPrompt, /likely_domain: baby/);
  assert.match(bbCalendarPrompt, /deterministic_candidate: bb_calendar_appointment/);
}

function assertBbCalendarDirectPath() {
  commandLog.length = 0;
  bridge.reminderRecipientMap = {
    7476829331: {
      primary_person_id: "per_husband",
    },
  };
  const envelope = bridge.tryDirectBbCalendarAppointmentTurn(bbCalendarAppointmentText(), "7476829331");
  assert.equal(envelope?.status, "reply");
  const calendarCommand = commandLog.find((command) => command?.argv?.[0] === "append_bb_calendar_event");
  assert.ok(calendarCommand, "expected append_bb_calendar_event command");
  assert.equal(commandLog.some((command) => command?.argv?.[0] === "append_task"), false, "BB appointment must not be routed to append_task directly");
  const payload = payloadOf(calendarCommand);
  assert.equal(payload.event_type, "clinic_visit");
  assert.equal(payload.title, "BB覆診 - 屯門醫院");
  assert.match(payload.start_at, /^[0-9]{4}-09-25 11:15:00\+08:00$/);
  assert.equal(payload.location, "屯門醫院");
  assert.equal(payload.related_person_id, "per_baby");
  assert.equal(payload.owner_person_id, "per_husband");
  assert.equal(payload.duration_minutes, 60);
  assert.equal(envelope.latest_successful_execution?.execution?.parsed_json?.action, "append_bb_calendar_event");
}

function assertHouseholdMemoryDirectPaths() {
  commandLog.length = 0;
  const saveEnvelope = bridge.tryDirectHouseholdMemoryTurn("幫我記住成長椅嘅工具 放咗喺工具箱");
  assert.equal(saveEnvelope?.status, "reply");
  const saveCommand = commandLog.find((command) => command?.argv?.[0] === "append_household_memory");
  assert.ok(saveCommand, "expected append_household_memory command");
  assert.deepEqual(pick(payloadOf(saveCommand), ["memory_type", "subject", "location", "status", "confidence"]), {
    memory_type: "item_location",
    subject: "成長椅嘅工具",
    location: "工具箱",
    status: "active",
    confidence: "confirmed",
  });

  commandLog.length = 0;
  const queryEnvelope = bridge.tryDirectHouseholdMemoryTurn("成長椅嘅工具放咗去邊");
  assert.equal(queryEnvelope?.status, "reply");
  assert.match(queryEnvelope.reply_text, /工具箱/);
  const queryCommand = commandLog.find((command) => command?.argv?.[0] === "query_household_memory");
  assert.ok(queryCommand, "expected query_household_memory command");
  assert.equal(payloadOf(queryCommand).subject, "成長椅嘅工具");
}

function assertSafetyStockDirectPath() {
  commandLog.length = 0;
  const envelope = bridge.tryDirectInventorySafetyStockTurn("幫我設定返白胡椒粉嘅安全存量係一樽");
  assert.equal(envelope?.status, "reply");
  const command = commandLog.find((entry) => entry?.argv?.[0] === "upsert_inventory_item");
  assert.ok(command, "expected upsert_inventory_item command");
  const payload = payloadOf(command);
  assert.equal(payload.item_id, "itm_white_pepper");
  assert.equal(payload.item_name, "白胡椒粉");
  assert.equal(payload.safety_stock, 1);
  assert.equal(payload.unit, "bottle");
}

function assertSingleRestockDirectPath() {
  const cases = [
    { userText: "買左一包糖", expected: { item_id: "itm_sugar", quantity: 1, unit: "pack" } },
    { userText: "糖買左一包", expected: { item_id: "itm_sugar", quantity: 1, unit: "pack" } },
    { userText: "啱啱買返一支牛奶啦", expected: { item_id: "itm_milk", quantity: 1, unit: "bottle" } },
  ];
  for (const { userText, expected } of cases) {
    commandLog.length = 0;
    const envelope = bridge.tryDirectExplicitInventoryRestockBatchTurn(userText);
    assert.equal(envelope?.status, "reply");
    const command = commandLog.find((entry) => entry?.argv?.[0] === "record_inventory_purchase_batch");
    assert.ok(command, `expected record_inventory_purchase_batch command for ${userText}`);
    const items = payloadOf(command).items;
    assert.deepEqual(items.map((item) => pick(item, ["item_id", "quantity", "unit"])), [
      expected,
    ]);
  }
}

function assertBatchRestockClarificationPath() {
  commandLog.length = 0;
  const original = "買左白胡椒 麻油 茄汁 蠔油 老醋 雞粉 各一支";
  const firstEnvelope = bridge.tryDirectExplicitInventoryRestockBatchTurn(original);
  assert.equal(firstEnvelope?.status, "clarify");
  assert.equal(commandLog.some((entry) => entry?.argv?.[0] === "record_inventory_purchase_batch"), false, "ambiguous batch must not partial-write");

  commandLog.length = 0;
  const stitched = [
    "Follow-up answer for the pending clarification.",
    `Original request: ${original}`,
    "Clarification question: 老醋係老抽、醋，定兩個都要加？",
    "Clarification answer: 老抽同醋係兩樣嘢嚟的 兩個紀錄都分別+1",
  ].join("\n");
  const secondEnvelope = bridge.tryDirectExplicitInventoryRestockBatchTurn(stitched);
  assert.equal(secondEnvelope?.status, "reply");
  const command = commandLog.find((entry) => entry?.argv?.[0] === "record_inventory_purchase_batch");
  assert.ok(command, "expected record_inventory_purchase_batch command");
  const items = payloadOf(command).items;
  assert.equal(items.length, 7);
  assert.ok(items.some((item) => item.item_name === "老抽"));
  assert.ok(items.some((item) => item.item_name === "醋"));
  assert.ok(items.some((item) => item.item_name === "雞粉" && item.unit === "pack"));
}

function assertShoppingTaskDonePath() {
  commandLog.length = 0;
  const envelope = bridge.tryDirectExplicitShoppingTaskDoneTurn("廁所墊同乾洗頭水已經買咗", {
    last_result_entities: [{
      kind: "task",
      entity_id: "tsk_shop_bathroom",
      name: "買廁所墊同乾洗頭水",
      status: "open",
      category: "shopping",
    }],
  });
  assert.equal(envelope?.status, "reply");
  const command = commandLog.find((entry) => entry?.argv?.[0] === "update_task");
  assert.ok(command, "expected update_task command");
  assert.equal(payloadOf(command).task_id, "tsk_shop_bathroom");
  assert.equal(payloadOf(command).patch.status, "done");
}

function assertConsumeDirectPath() {
  commandLog.length = 0;
  const envelope = bridge.tryDirectExplicitInventoryConsumeTurn("食咗一個公仔麵，同一隻雞蛋");
  assert.equal(envelope?.status, "reply");
  const command = commandLog.find((entry) => entry?.argv?.[0] === "record_inventory_consume_batch");
  assert.ok(command, "expected record_inventory_consume_batch command");
  const items = payloadOf(command).items;
  assert.equal(items.length, 2);
  assert.deepEqual(items.map((item) => pick(item, ["item_id", "quantity", "unit"])), [
    { item_id: "itm_noodles", quantity: 1, unit: "pack" },
    { item_id: "itm_egg", quantity: 1, unit: "piece" },
  ]);

  commandLog.length = 0;
  const clarifyEnvelope = bridge.tryDirectExplicitInventoryConsumeTurn("食咗一個公仔麵，同一隻蛋");
  assert.equal(clarifyEnvelope?.status, "clarify");
  assert.match(clarifyEnvelope.clarification?.question || "", /蛋/);
  assert.equal(commandLog.some((entry) => entry?.argv?.[0] === "record_inventory_consume_batch"), false, "ambiguous consume batch must not partial-write");
  const chickenEggChoice = clarifyEnvelope.clarification.choices.find((choice) => choice.label === "雞蛋");
  assert.ok(chickenEggChoice, "expected chicken egg clarification choice");

  commandLog.length = 0;
  const stitched = [
    "Follow-up answer for the pending clarification.",
    "Original request: 食咗一個公仔麵，同一隻蛋",
    `Clarification question: ${clarifyEnvelope.clarification.question}`,
    "Clarification answer: 雞蛋",
    `Suggested resolved request: ${chickenEggChoice.resume_text}`,
  ].join("\n");
  const resumedEnvelope = bridge.tryDirectExplicitInventoryConsumeTurn(stitched);
  assert.equal(resumedEnvelope?.status, "reply");
  const resumedCommand = commandLog.find((entry) => entry?.argv?.[0] === "record_inventory_consume_batch");
  assert.ok(resumedCommand, "expected resumed record_inventory_consume_batch command");
  const resumedItems = payloadOf(resumedCommand).items;
  assert.deepEqual(resumedItems.map((item) => pick(item, ["item_id", "quantity", "unit"])), [
    { item_id: "itm_noodles", quantity: 1, unit: "pack" },
    { item_id: "itm_egg", quantity: 1, unit: "piece" },
  ]);
}

function ok(action, result) {
  return {
    ok: true,
    command_id: "bb_inventory_api",
    exit_code: 0,
    stdout: "",
    stderr: "",
    parsed_json: {
      action,
      result,
    },
    error: "",
  };
}

function payloadOf(commandRequest) {
  const argv = Array.isArray(commandRequest?.argv) ? commandRequest.argv : [];
  const index = argv.indexOf("--payload-json");
  assert.notEqual(index, -1, `missing --payload-json for ${argv[0] || "unknown action"}`);
  return JSON.parse(argv[index + 1]);
}

function pick(value, keys) {
  return Object.fromEntries(keys.map((key) => [key, value[key]]));
}

function bbCalendarAppointmentText() {
  return Buffer.from("5aSa5q+U5aSa5q+U77yM5bmr5oiR6KiY5b6XQkLopoHkv4I55pyIMjXml6Xml6nkuIoxMem7njE15YiG5L+C5bGv6ZaA6Yar6Zmi6KaG6Ki6", "base64").toString("utf8");
}
