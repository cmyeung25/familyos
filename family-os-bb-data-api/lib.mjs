import { randomUUID, timingSafeEqual } from "node:crypto";
import mysql from "mysql2/promise";
import {
  SUPPORTED_EVENT_TYPES,
  buildFeedingRemarks,
  fromDbUtc,
  mapLegacyRecord,
  mapPwaPayload,
  parseTimestamp,
  toDbUtc,
  toHongKongTimestamp,
} from "./mapping.mjs";

function configured(name, fallback = "") {
  return String(process.env[name] || fallback).trim();
}

function required(name) {
  const value = configured(name);
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function positiveInteger(value, fallback, maximum) {
  const parsed = Number(value || fallback);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > maximum) throw new Error("Invalid numeric configuration.");
  return parsed;
}

export const config = Object.freeze({
  dbHost: required("FAMILY_OS_BB_DB_HOST"),
  dbPort: positiveInteger(configured("FAMILY_OS_BB_DB_PORT"), 3306, 65535),
  dbName: required("FAMILY_OS_BB_DB_NAME"),
  dbUser: required("FAMILY_OS_BB_DB_USER"),
  dbPassword: required("FAMILY_OS_BB_DB_PASSWORD"),
  apiKey: required("FAMILY_OS_BB_DATA_API_KEY"),
  port: positiveInteger(configured("FAMILY_OS_BB_DATA_API_PORT"), 8788, 65535),
  householdId: configured("FAMILY_OS_BB_HOUSEHOLD_ID", "hh_home"),
  defaultBabyPersonId: configured("FAMILY_OS_BB_DEFAULT_BABY_PERSON_ID", "per_baby"),
  migrationFrom: configured("FAMILY_OS_BB_MIGRATION_FROM"),
});

export const pool = mysql.createPool({
  host: config.dbHost,
  port: config.dbPort,
  database: config.dbName,
  user: config.dbUser,
  password: config.dbPassword,
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 20,
  timezone: "Z",
  dateStrings: true,
  decimalNumbers: true,
  enableKeepAlive: true,
});

export class ApiError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

function makeId(prefix) {
  return `${prefix}_${randomUUID()}`;
}

function safeJson(value) {
  return JSON.stringify(value ?? null);
}

function clamp(value, minimum, maximum, fallback) {
  const number = Number(value ?? fallback);
  if (!Number.isInteger(number) || number < minimum || number > maximum) throw new ApiError(`Value must be an integer from ${minimum} to ${maximum}.`);
  return number;
}

function assertAllowedKeys(payload, keys, action) {
  for (const key of Object.keys(payload || {})) {
    if (!keys.has(key)) throw new ApiError(`Unsupported ${action} field: ${key}`);
  }
}

function assertApiKey(candidate) {
  const received = Buffer.from(String(candidate || ""));
  const expected = Buffer.from(config.apiKey);
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    throw new ApiError("Unauthorized.", 401);
  }
}

function dbNow() {
  return toDbUtc(new Date());
}

async function ensureBabyProfile(connection, event) {
  await connection.execute(
    `INSERT INTO baby_profiles (
       baby_person_id, household_id, status, created_by, updated_by
     ) VALUES (?, ?, 'active', ?, ?)
     ON DUPLICATE KEY UPDATE baby_person_id = VALUES(baby_person_id)`,
    [event.baby_person_id, event.household_id, event.created_by, event.updated_by],
  );
}

async function insertDetail(connection, mapped) {
  const { event, detail } = mapped;
  if (detail.type === "feeding") {
    await connection.execute(
      `INSERT INTO baby_feeding_logs (
         event_id, feeding_method, prepared_amount_ml, consumed_amount_ml,
         feed_started_at, feed_ended_at, bottle_expires_at, medicine_given
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [event.event_id, detail.feeding_method, detail.prepared_amount_ml, detail.consumed_amount_ml,
        detail.feed_started_at, detail.feed_ended_at, detail.bottle_expires_at, detail.medicine_given],
    );
    return;
  }
  if (detail.type === "diaper") {
    await connection.execute(
      "INSERT INTO baby_diaper_logs (event_id, pee_intensity, poo_intensity) VALUES (?, ?, ?)",
      [event.event_id, detail.pee_intensity, detail.poo_intensity],
    );
    return;
  }
  await connection.execute(
    "INSERT INTO baby_temperature_logs (event_id, temperature_celsius, measurement_method, device_label) VALUES (?, ?, ?, ?)",
    [event.event_id, detail.temperature_celsius, detail.measurement_method, detail.device_label],
  );
}

async function insertEvent(connection, mapped) {
  const event = mapped.event;
  await ensureBabyProfile(connection, event);
  await connection.execute(
    `INSERT INTO baby_events (
       event_id, household_id, baby_person_id, event_type, event_at,
       recorded_by_person_id, source, status, client_request_id, row_version,
       created_at, updated_at, created_by, updated_by, notes
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [event.event_id, event.household_id, event.baby_person_id, event.event_type, event.event_at,
      event.recorded_by_person_id, event.source, event.status, event.client_request_id, event.row_version,
      event.created_at, event.updated_at, event.created_by, event.updated_by, event.notes],
  );
  await insertDetail(connection, mapped);
}

async function writeAudit(connection, { event, operation, actorType, actorId, source, before, after, requestText }) {
  await connection.execute(
    `INSERT INTO baby_event_audit (
       audit_id, event_id, household_id, operation, actor_type, actor_id,
       source, before_json, after_json, request_text, result_status
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'success')`,
    [makeId("bb_audit"), event.event_id, event.household_id, operation, actorType, actorId,
      source, safeJson(before), safeJson(after), String(requestText || "") || null],
  );
}

const SELECT_EVENT = `
  SELECT
    event.event_id, event.household_id, event.baby_person_id, event.event_type, event.event_at,
    event.recorded_by_person_id, event.source, event.status, event.client_request_id, event.row_version,
    event.created_at, event.updated_at, event.created_by, event.updated_by, event.notes,
    feeding.feeding_method, feeding.prepared_amount_ml, feeding.consumed_amount_ml,
    feeding.feed_started_at, feeding.feed_ended_at, feeding.bottle_expires_at, feeding.medicine_given,
    diaper.pee_intensity, diaper.poo_intensity, temperature.temperature_celsius,
    temperature.measurement_method, temperature.device_label
  FROM baby_events AS event
  LEFT JOIN baby_feeding_logs AS feeding ON feeding.event_id = event.event_id
  LEFT JOIN baby_diaper_logs AS diaper ON diaper.event_id = event.event_id
  LEFT JOIN baby_temperature_logs AS temperature ON temperature.event_id = event.event_id
`;

function compatRecord(row) {
  const type = row.event_type;
  const startedAt = type === "feeding" ? fromDbUtc(row.feed_started_at) : "";
  const endedAt = type === "feeding" ? fromDbUtc(row.feed_ended_at) : "";
  const valueText = type === "diaper"
    ? JSON.stringify({ pee: row.pee_intensity, poo: row.poo_intensity })
    : "";
  const valueNumber = type === "feeding"
    ? row.consumed_amount_ml
    : type === "temperature" ? row.temperature_celsius : "";
  return {
    baby_log_id: row.event_id,
    event_at: fromDbUtc(row.event_at),
    log_type: type,
    log_subtype: type === "feeding" ? row.feeding_method : type === "diaper" ? "pee_poo" : "body",
    description: row.notes || "",
    value_number: valueNumber === null || valueNumber === undefined ? "" : Number(valueNumber),
    value_text: valueText,
    unit: type === "feeding" ? "ml" : type === "temperature" ? "celsius" : "",
    started_at: startedAt,
    ended_at: endedAt,
    duration_minutes: startedAt && endedAt ? Math.max(0, Math.round((new Date(endedAt.replace(" ", "T")).getTime() - new Date(startedAt.replace(" ", "T")).getTime()) / 60000)) : "",
    status: row.status,
    created_at: fromDbUtc(row.created_at),
    updated_at: fromDbUtc(row.updated_at),
    remarks: type === "feeding" ? buildFeedingRemarks(row) : "Recorded through Family OS BB Data API",
    row_version: Number(row.row_version),
  };
}

function legacyRecord(row) {
  return {
    ...compatRecord(row),
    household_id: row.household_id,
    baby_person_id: row.baby_person_id,
    recorded_by_person_id: row.recorded_by_person_id || "",
    created_by: row.created_by,
    updated_by: row.updated_by,
    client_request_id: row.client_request_id || "",
  };
}

async function findEvent(connection, eventId, { includeDeleted = false } = {}) {
  const [rows] = await connection.execute(
    `${SELECT_EVENT} WHERE event.event_id = ? AND event.household_id = ? ${includeDeleted ? "" : "AND event.status = 'active'"}`,
    [eventId, config.householdId],
  );
  return rows[0] || null;
}

async function replaceDetail(connection, mapped) {
  const eventId = mapped.event.event_id;
  if (mapped.detail.type === "feeding") {
    await connection.execute(
      `UPDATE baby_feeding_logs
       SET feeding_method = ?, prepared_amount_ml = ?, consumed_amount_ml = ?,
           feed_started_at = ?, feed_ended_at = ?, bottle_expires_at = ?, medicine_given = ?
       WHERE event_id = ?`,
      [mapped.detail.feeding_method, mapped.detail.prepared_amount_ml, mapped.detail.consumed_amount_ml,
        mapped.detail.feed_started_at, mapped.detail.feed_ended_at, mapped.detail.bottle_expires_at,
        mapped.detail.medicine_given, eventId],
    );
    return;
  }
  if (mapped.detail.type === "diaper") {
    await connection.execute(
      "UPDATE baby_diaper_logs SET pee_intensity = ?, poo_intensity = ? WHERE event_id = ?",
      [mapped.detail.pee_intensity, mapped.detail.poo_intensity, eventId],
    );
    return;
  }
  await connection.execute(
    "UPDATE baby_temperature_logs SET temperature_celsius = ?, measurement_method = ?, device_label = ? WHERE event_id = ?",
    [mapped.detail.temperature_celsius, mapped.detail.measurement_method, mapped.detail.device_label, eventId],
  );
}

function actionDefaults({ now = new Date(), actor = "bb_data_api", source = "bb_data_api", eventId } = {}) {
  return {
    householdId: config.householdId,
    babyPersonId: config.defaultBabyPersonId,
    source,
    actor,
    now,
    eventId,
  };
}

async function appendBabyLog(payload, requestText) {
  const mapped = mapPwaPayload(payload, actionDefaults({ actor: "ipad_pwa", source: "ipad_pwa" }));
  if (mapped.unsupported) throw new ApiError(`Unsupported BB log type: ${mapped.logType}`);
  if (mapped.event.household_id !== config.householdId) throw new ApiError("household_id does not match this API instance.", 403);

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    if (mapped.event.client_request_id) {
      const [existingRows] = await connection.execute(
        "SELECT event_id FROM baby_events WHERE client_request_id = ?",
        [mapped.event.client_request_id],
      );
      if (existingRows[0]) {
        const existing = await findEvent(connection, existingRows[0].event_id, { includeDeleted: true });
        await connection.commit();
        return compatRecord(existing);
      }
    }
    await insertEvent(connection, mapped);
    const after = compatRecord(await findEvent(connection, mapped.event.event_id, { includeDeleted: true }));
    await writeAudit(connection, {
      event: mapped.event, operation: "append", actorType: "api", actorId: "ipad_pwa",
      source: "bb_data_api", before: {}, after, requestText,
    });
    await connection.commit();
    return after;
  } catch (error) {
    await connection.rollback();
    if (error?.code === "ER_DUP_ENTRY" && mapped.event.client_request_id) {
      const existing = await findEvent(connection, mapped.event.event_id, { includeDeleted: true });
      if (existing) return compatRecord(existing);
    }
    throw error;
  } finally {
    connection.release();
  }
}

async function updateBabyLog(payload, requestText) {
  assertAllowedKeys(payload, new Set(["baby_log_id", "patch", "expected_updated_at"]), "update_baby_log");
  const eventId = String(payload.baby_log_id || "").trim();
  if (!eventId) throw new ApiError("baby_log_id is required.");
  const patch = payload.patch && typeof payload.patch === "object" ? payload.patch : null;
  if (!patch || Object.keys(patch).length === 0) throw new ApiError("patch must contain at least one field.");
  assertAllowedKeys(patch, new Set([
    "event_at", "log_subtype", "description", "value_number", "value_text", "unit",
    "started_at", "ended_at", "recorded_by_person_id", "remarks",
  ]), "patch");

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const beforeRow = await findEvent(connection, eventId);
    if (!beforeRow) throw new ApiError(`Unknown active baby_log_id: ${eventId}`, 404);
    const before = compatRecord(beforeRow);
    if (payload.expected_updated_at && String(payload.expected_updated_at) !== before.updated_at) {
      throw new ApiError("Baby log changed after it was loaded. Refresh and try again.", 409);
    }
    const merged = { ...legacyRecord(beforeRow), ...patch, baby_log_id: eventId, row_version: Number(beforeRow.row_version) + 1 };
    const mapped = mapLegacyRecord(merged, actionDefaults({ actor: "ipad_pwa", source: beforeRow.source, eventId }));
    if (mapped.unsupported || mapped.event.event_type !== beforeRow.event_type) throw new ApiError("Changing BB log type is not supported.");
    mapped.event.client_request_id = beforeRow.client_request_id;
    mapped.event.created_at = beforeRow.created_at;
    mapped.event.created_by = beforeRow.created_by;
    mapped.event.status = beforeRow.status;
    mapped.event.updated_at = dbNow();
    mapped.event.updated_by = "ipad_pwa";

    const [result] = await connection.execute(
      `UPDATE baby_events
       SET event_at = ?, recorded_by_person_id = ?, row_version = ?, updated_at = ?, updated_by = ?, notes = ?
       WHERE event_id = ? AND row_version = ? AND status = 'active'`,
      [mapped.event.event_at, mapped.event.recorded_by_person_id, mapped.event.row_version,
        mapped.event.updated_at, mapped.event.updated_by, mapped.event.notes, eventId, beforeRow.row_version],
    );
    if (result.affectedRows !== 1) throw new ApiError("Baby log changed after it was loaded. Refresh and try again.", 409);
    await replaceDetail(connection, mapped);
    const after = compatRecord(await findEvent(connection, eventId, { includeDeleted: true }));
    await writeAudit(connection, {
      event: mapped.event, operation: "update", actorType: "api", actorId: "ipad_pwa",
      source: "bb_data_api", before, after, requestText,
    });
    await connection.commit();
    return after;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function deleteBabyLog(payload, requestText) {
  assertAllowedKeys(payload, new Set(["baby_log_id", "expected_updated_at"]), "delete_baby_log");
  const eventId = String(payload.baby_log_id || "").trim();
  if (!eventId) throw new ApiError("baby_log_id is required.");
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const beforeRow = await findEvent(connection, eventId);
    if (!beforeRow) throw new ApiError(`Unknown active baby_log_id: ${eventId}`, 404);
    const before = compatRecord(beforeRow);
    if (payload.expected_updated_at && String(payload.expected_updated_at) !== before.updated_at) {
      throw new ApiError("Baby log changed after it was loaded. Refresh and try again.", 409);
    }
    const updatedAt = dbNow();
    const [result] = await connection.execute(
      `UPDATE baby_events
       SET status = 'deleted', row_version = row_version + 1, updated_at = ?, updated_by = 'ipad_pwa'
       WHERE event_id = ? AND row_version = ? AND status = 'active'`,
      [updatedAt, eventId, beforeRow.row_version],
    );
    if (result.affectedRows !== 1) throw new ApiError("Baby log changed after it was loaded. Refresh and try again.", 409);
    const afterRow = await findEvent(connection, eventId, { includeDeleted: true });
    const after = compatRecord(afterRow);
    await writeAudit(connection, {
      event: afterRow, operation: "delete", actorType: "api", actorId: "ipad_pwa",
      source: "bb_data_api", before, after, requestText,
    });
    await connection.commit();
    return after;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

function normalizeRange(payload) {
  const hasFrom = payload.from !== undefined && payload.from !== null && payload.from !== "";
  const hasTo = payload.to !== undefined && payload.to !== null && payload.to !== "";
  if (hasFrom !== hasTo) throw new ApiError("from and to must be provided together.");
  let from;
  let to;
  if (hasFrom) {
    from = parseTimestamp(payload.from, "from");
    to = parseTimestamp(payload.to, "to");
  } else {
    const days = clamp(payload.days, 1, 30, 7);
    to = new Date();
    from = new Date(to.getTime() - days * 86400000);
  }
  if (from >= to) throw new ApiError("to must be after from.");
  if (Math.ceil((to.getTime() - from.getTime()) / 86400000) > 30) throw new ApiError("Baby log date range cannot exceed 30 days.");
  return { from, to };
}

function encodeCursor(row) {
  return encodeURIComponent(`${fromDbUtc(row.event_at)}|${row.event_id}`);
}

function decodeCursor(cursor) {
  if (!cursor) return null;
  try {
    const decoded = decodeURIComponent(String(cursor));
    const divider = decoded.lastIndexOf("|");
    if (divider <= 0) throw new Error("Invalid cursor.");
    return { eventAt: toDbUtc(decoded.slice(0, divider), "cursor"), eventId: decoded.slice(divider + 1) };
  } catch {
    throw new ApiError("Invalid baby log cursor.");
  }
}

async function queryBabyLogs(payload) {
  assertAllowedKeys(payload, new Set(["from", "to", "days", "log_type", "limit", "cursor"]), "query_baby_logs");
  const range = normalizeRange(payload);
  const limit = clamp(payload.limit, 1, 200, 100);
  const type = String(payload.log_type || "").trim();
  if (type && !SUPPORTED_EVENT_TYPES.has(type)) throw new ApiError("Unsupported log_type.");
  const cursor = decodeCursor(payload.cursor);
  const where = ["event.household_id = ?", "event.status = 'active'", "event.event_at >= ?", "event.event_at <= ?"];
  const values = [config.householdId, toDbUtc(range.from), toDbUtc(range.to)];
  if (type) {
    where.push("event.event_type = ?");
    values.push(type);
  }
  if (cursor) {
    where.push("(event.event_at < ? OR (event.event_at = ? AND event.event_id < ?))");
    values.push(cursor.eventAt, cursor.eventAt, cursor.eventId);
  }
  values.push(limit + 1);
  const [rows] = await pool.execute(
    `${SELECT_EVENT} WHERE ${where.join(" AND ")} ORDER BY event.event_at DESC, event.event_id DESC LIMIT ?`,
    values,
  );
  const hasMore = rows.length > limit;
  const pageRows = rows.slice(0, limit);
  return {
    items: pageRows.map(compatRecord),
    range: { from: toHongKongTimestamp(range.from), to: toHongKongTimestamp(range.to), days: Math.ceil((range.to - range.from) / 86400000) },
    page: {
      limit,
      count: pageRows.length,
      has_more: hasMore,
      next_cursor: hasMore && pageRows.length ? encodeCursor(pageRows[pageRows.length - 1]) : "",
    },
  };
}

async function getRecentBabyLogs(payload) {
  assertAllowedKeys(payload, new Set(["limit", "log_type"]), "get_recent_baby_logs");
  const limit = clamp(payload.limit, 1, 100, 20);
  const type = String(payload.log_type || "").trim();
  if (type && !SUPPORTED_EVENT_TYPES.has(type)) throw new ApiError("Unsupported log_type.");
  const where = ["event.household_id = ?", "event.status = 'active'"];
  const values = [config.householdId];
  if (type) {
    where.push("event.event_type = ?");
    values.push(type);
  }
  values.push(limit);
  const [rows] = await pool.execute(
    `${SELECT_EVENT} WHERE ${where.join(" AND ")} ORDER BY event.event_at DESC, event.event_id DESC LIMIT ?`,
    values,
  );
  return rows.map(compatRecord);
}

export async function databaseHealth() {
  const [rows] = await pool.query("SELECT 1 AS ok");
  return rows[0]?.ok === 1;
}

export async function runAction(action, payload = {}, requestText = "") {
  switch (String(action || "")) {
    case "health":
      await databaseHealth();
      return {
        service: "family-os-bb-data-api",
        version: "family_os_bb_data_api_v1",
        household_id: config.householdId,
        schema_version: "familyos_gary_bb_001",
        data_path: { api: "bb_data_api", storage: "mariadb" },
        timestamp: toHongKongTimestamp(new Date()),
      };
    case "get_recent_baby_logs":
      return getRecentBabyLogs(payload);
    case "query_baby_logs":
      return queryBabyLogs(payload);
    case "append_baby_log":
      return appendBabyLog(payload, requestText);
    case "update_baby_log":
      return updateBabyLog(payload, requestText);
    case "delete_baby_log":
      return deleteBabyLog(payload, requestText);
    default:
      throw new ApiError(`Unsupported action: ${action}`);
  }
}

export async function importSourceRecord(record) {
  const mapped = mapLegacyRecord(record, actionDefaults({ actor: "google_sheets_migration", source: "google_sheets_import" }));
  if (mapped.unsupported) return { status: "unsupported", log_type: mapped.logType, baby_log_id: record.baby_log_id || "" };
  if (mapped.event.household_id !== config.householdId) throw new ApiError("Source record belongs to a different household.", 403);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [importRows] = await connection.execute(
      "SELECT event_id FROM baby_event_imports WHERE source_system = 'google_sheets_baby_log' AND source_record_id = ?",
      [mapped.event.event_id],
    );
    if (importRows[0]) {
      await connection.commit();
      return { status: "skipped", baby_log_id: mapped.event.event_id };
    }
    await insertEvent(connection, mapped);
    await connection.execute(
      `INSERT INTO baby_event_imports (source_system, source_record_id, event_id, source_payload)
       VALUES ('google_sheets_baby_log', ?, ?, ?)`,
      [mapped.event.event_id, mapped.event.event_id, safeJson(record)],
    );
    const after = compatRecord(await findEvent(connection, mapped.event.event_id, { includeDeleted: true }));
    await writeAudit(connection, {
      event: mapped.event, operation: "import", actorType: "migration", actorId: "google_sheets_baby_log",
      source: "google_sheets_import", before: {}, after, requestText: "One-time Google Sheets baby_log import",
    });
    await connection.commit();
    return { status: "imported", baby_log_id: mapped.event.event_id };
  } catch (error) {
    await connection.rollback();
    if (error?.code === "ER_DUP_ENTRY") throw new ApiError(`Import conflict for source baby_log_id: ${mapped.event.event_id}`, 409);
    throw error;
  } finally {
    connection.release();
  }
}

export async function importedSourceCount() {
  const [rows] = await pool.execute(
    "SELECT COUNT(*) AS count FROM baby_event_imports WHERE source_system = 'google_sheets_baby_log'",
  );
  return Number(rows[0]?.count || 0);
}

export { assertApiKey };
