import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

const schemaPath = fileURLToPath(new URL("../migrations/001_initial_schema.sql", import.meta.url));
const modelPath = fileURLToPath(new URL("../data-model.md", import.meta.url));

test("BB MariaDB draft separates each iPad record type into typed tables", async () => {
  const schema = await readFile(schemaPath, "utf8");

  for (const table of [
    "schema_migrations",
    "baby_profiles",
    "baby_events",
    "baby_feeding_logs",
    "baby_feeding_medications",
    "baby_diaper_logs",
    "baby_temperature_logs",
    "baby_event_audit",
    "baby_event_imports",
  ]) {
    assert.match(schema, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`));
  }

  assert.match(schema, /event_type ENUM\('feeding', 'diaper', 'temperature'\)/);
  assert.match(schema, /prepared_amount_ml/);
  assert.match(schema, /consumed_amount_ml/);
  assert.match(schema, /medicine_given BOOLEAN/);
  assert.match(schema, /pee_intensity ENUM\('none', 'small', 'medium', 'large'\)/);
  assert.match(schema, /temperature_celsius DECIMAL\(4,1\)/);
  assert.match(schema, /status ENUM\('active', 'deleted'\)/);
  assert.match(schema, /row_version BIGINT UNSIGNED/);
  assert.match(schema, /UNIQUE KEY uq_baby_events_client_request_id/);
  assert.match(schema, /CREATE OR REPLACE VIEW v_baby_log_compat/);
  assert.doesNotMatch(schema, /CREATE TABLE IF NOT EXISTS baby_logs\b/);
});

test("BB MariaDB draft documents the legacy migration and rejects generic structured storage", async () => {
  const model = await readFile(modelPath, "utf8");

  assert.match(model, /remarks\.prepared_ml/);
  assert.match(model, /diaper `value_text` JSON/);
  assert.match(model, /Do not put a new event type's structured values into `notes`, JSON blobs, or a generic `value_number` field/);
});
