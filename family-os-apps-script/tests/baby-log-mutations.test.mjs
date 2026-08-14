import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../Code.gs", import.meta.url), "utf8");

function loadCode() {
  const context = {
    PropertiesService: {
      getScriptProperties: () => ({ getProperty: () => "" }),
    },
    Utilities: {
      formatDate: (value) => value instanceof Date
        ? value.toISOString().replace("T", " ").replace(".000Z", "+08:00")
        : String(value),
    },
    console,
  };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "Code.gs" });
  return context;
}

function feedingRecord() {
  return {
    baby_log_id: "baby_test",
    household_id: "hh_home",
    event_at: "2026-08-14 12:00:00+08:00",
    log_type: "feeding",
    log_subtype: "formula_milk",
    description: "BB 飲奶 120 ml",
    value_number: 120,
    value_text: "",
    unit: "ml",
    started_at: "2026-08-14 12:00:00+08:00",
    ended_at: "2026-08-14 12:20:00+08:00",
    status: "active",
    created_at: "2026-08-14 12:20:00+08:00",
    updated_at: "2026-08-14 12:20:00+08:00",
    remarks: "Recorded through iPad BB App; prepared_ml=120; actual_ml=120",
  };
}

function setupMutation(record = feedingRecord()) {
  const context = loadCode();
  const writes = [];
  const audits = [];
  context.findRecordWithRow_ = () => ({ rowNumber: 7, record: { ...record } });
  context.writeRecordFields_ = (sheet, row, changes) => writes.push({ sheet, row, changes });
  context.appendAudit_ = (sheet, id, operation, before, after) => audits.push({ sheet, id, operation, before, after });
  context.now_ = () => "2026-08-14 15:00:00+08:00";
  return { context, writes, audits };
}

test("update_baby_log changes only the located row and appends an update audit", () => {
  const { context, writes, audits } = setupMutation();
  const result = context.updateBabyLog_({
    baby_log_id: "baby_test",
    expected_updated_at: "2026-08-14 12:20:00+08:00",
    patch: {
      value_number: 90,
      remarks: "Recorded through iPad BB App; prepared_ml=120; actual_ml=90",
    },
  }, { request_text: "edit feed" });

  assert.equal(result.value_number, 90);
  assert.equal(result.description, "BB 飲奶 90 ml");
  assert.equal(writes.length, 1);
  assert.equal(writes[0].sheet, "baby_log");
  assert.equal(writes[0].row, 7);
  assert.equal(writes[0].changes.value_number, 90);
  assert.equal(writes[0].changes.status, undefined);
  assert.equal(audits.length, 1);
  assert.equal(audits[0].operation, "update");
  assert.equal(audits[0].before.value_number, 120);
  assert.equal(audits[0].after.value_number, 90);
});

test("update_baby_log rejects a stale version before writing", () => {
  const { context, writes, audits } = setupMutation();
  assert.throws(() => context.updateBabyLog_({
    baby_log_id: "baby_test",
    expected_updated_at: "2026-08-14 11:00:00+08:00",
    patch: { value_number: 90 },
  }, {}), /changed after it was loaded/);
  assert.equal(writes.length, 0);
  assert.equal(audits.length, 0);
});

test("delete_baby_log soft-deletes and preserves an audit snapshot", () => {
  const { context, writes, audits } = setupMutation();
  const result = context.deleteBabyLog_({
    baby_log_id: "baby_test",
    expected_updated_at: "2026-08-14 12:20:00+08:00",
  }, { request_text: "delete feed" });

  assert.equal(result.status, "deleted");
  assert.equal(writes[0].changes.status, "deleted");
  assert.equal(writes[0].changes.updated_at, "2026-08-14 15:00:00+08:00");
  assert.equal(writes[0].changes.updated_by, "apps_script");
  assert.deepEqual(Object.keys(writes[0].changes).sort(), ["status", "updated_at", "updated_by"]);
  assert.equal(audits[0].operation, "delete");
  assert.equal(audits[0].before.status, "active");
  assert.equal(audits[0].after.status, "deleted");
});

test("diaper edits reject an empty pee and poo combination", () => {
  const diaper = {
    ...feedingRecord(),
    log_type: "diaper",
    value_number: "",
    value_text: JSON.stringify({ pee: "medium", poo: "none" }),
    unit: "",
  };
  const { context, writes } = setupMutation(diaper);
  assert.throws(() => context.updateBabyLog_({
    baby_log_id: "baby_test",
    expected_updated_at: "2026-08-14 12:20:00+08:00",
    patch: { value_text: JSON.stringify({ pee: "none", poo: "none" }) },
  }, {}), /Select at least one diaper amount/);
  assert.equal(writes.length, 0);
});
