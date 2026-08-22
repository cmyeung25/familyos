import assert from "node:assert/strict";
import test from "node:test";
import { mapLegacyRecord, mapPwaPayload, toHongKongTimestamp } from "../mapping.mjs";

const defaults = {
  householdId: "hh_home",
  babyPersonId: "per_baby",
  source: "google_sheets_import",
  actor: "migration",
  now: new Date("2026-08-22T12:00:00.000Z"),
};

test("maps a legacy feeding row into typed fields without parsing the description", () => {
  const mapped = mapLegacyRecord({
    baby_log_id: "baby_source_1",
    event_at: "2026-08-22 14:26:57+08:00",
    log_type: "feeding",
    log_subtype: "formula_milk",
    value_number: "120",
    unit: "ml",
    started_at: "2026-08-22 14:26:57+08:00",
    ended_at: "2026-08-22 15:16:06+08:00",
    remarks: "Recorded through iPad BB App; prepared_ml=120; actual_ml=120; medicine_given=false; prepared_at=2026-08-22 14:26:57+08:00; expires_at=2026-08-22 15:26:57+08:00",
  }, defaults);

  assert.equal(mapped.event.event_id, "baby_source_1");
  assert.equal(mapped.event.event_at, "2026-08-22 06:26:57.000");
  assert.equal(mapped.detail.prepared_amount_ml, 120);
  assert.equal(mapped.detail.consumed_amount_ml, 120);
  assert.equal(mapped.detail.medicine_given, false);
});

test("maps an iPad diaper payload and rejects unsupported source event types", () => {
  const diaper = mapPwaPayload({
    event_at: "2026-08-22 20:41:41+08:00",
    log_type: "diaper",
    log_subtype: "pee_poo",
    value_text: JSON.stringify({ pee: "small", poo: "none" }),
  }, { ...defaults, eventId: "baby_new_1" });
  assert.deepEqual(diaper.detail, { type: "diaper", pee_intensity: "small", poo_intensity: "none" });

  const unsupported = mapLegacyRecord({ log_type: "vaccination", event_at: toHongKongTimestamp(defaults.now) }, defaults);
  assert.equal(unsupported.unsupported, true);
  assert.equal(unsupported.logType, "vaccination");
});
