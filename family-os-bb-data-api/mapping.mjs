import { randomUUID } from "node:crypto";

export const HK_TIME_ZONE = "Asia/Hong_Kong";
export const SUPPORTED_EVENT_TYPES = new Set(["feeding", "diaper", "temperature"]);
export const INTENSITIES = new Set(["none", "small", "medium", "large"]);
const FEEDING_METHODS = new Set(["formula_milk", "breast_milk", "expressed_milk", "solid_food", "other"]);

const hongKongFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: HK_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function requireText(value, field) {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`${field} is required.`);
  return text;
}

function optionalText(value) {
  return String(value ?? "").trim();
}

function asFiniteNumber(value, field, { optional = false } = {}) {
  if (value === "" || value === null || value === undefined) {
    if (optional) return null;
    throw new Error(`${field} is required.`);
  }
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${field} must be a number.`);
  return number;
}

function asBoolean(value) {
  return value === true || String(value).toLowerCase() === "true" || value === 1 || value === "1";
}

export function parseTimestamp(value, field, { optional = false } = {}) {
  if (value === "" || value === null || value === undefined) {
    if (optional) return null;
    throw new Error(`${field} is required.`);
  }
  let normalized = String(value).trim().replace(" ", "T");
  if (!/[zZ]$|[+-]\d{2}:\d{2}$/.test(normalized)) normalized += "+08:00";
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) throw new Error(`${field} is not a valid timestamp.`);
  return date;
}

export function toDbUtc(value, field = "timestamp") {
  const date = value instanceof Date ? value : parseTimestamp(value, field);
  return date.toISOString().slice(0, 23).replace("T", " ");
}

export function fromDbUtc(value) {
  if (value === null || value === undefined || value === "") return "";
  if (value instanceof Date) return toHongKongTimestamp(value);
  const raw = String(value).trim().replace(" ", "T");
  const match = raw.match(/^(.+?)(?:\.(\d{1,6}))?$/);
  if (!match) throw new Error("Database returned an invalid UTC timestamp.");
  const normalized = `${match[1]}.${String(match[2] || "").slice(0, 3).padEnd(3, "0")}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) throw new Error("Database returned an invalid UTC timestamp.");
  return toHongKongTimestamp(date);
}

export function toHongKongTimestamp(value) {
  const date = value instanceof Date ? value : parseTimestamp(value, "timestamp");
  const parts = Object.fromEntries(hongKongFormatter.formatToParts(date)
    .filter((part) => part.type !== "literal")
    .map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}.${String(date.getUTCMilliseconds()).padStart(3, "0")}+08:00`;
}

export function parseRemarks(value) {
  const remarks = String(value ?? "");
  const valueFor = (key) => {
    const match = remarks.match(new RegExp(`(?:^|;\\s*)${key}=([^;]+)`, "i"));
    return match ? match[1].trim() : "";
  };
  const numericFor = (key) => {
    const raw = valueFor(key);
    return raw === "" ? null : asFiniteNumber(raw, key, { optional: true });
  };
  return {
    preparedMl: numericFor("prepared_ml"),
    actualMl: numericFor("actual_ml"),
    medicineGiven: asBoolean(valueFor("medicine_given")),
    preparedAt: valueFor("prepared_at"),
    expiresAt: valueFor("expires_at"),
  };
}

export function buildFeedingRemarks(detail) {
  const fields = [];
  if (detail.prepared_amount_ml !== null && detail.prepared_amount_ml !== undefined) fields.push(`prepared_ml=${Number(detail.prepared_amount_ml)}`);
  if (detail.consumed_amount_ml !== null && detail.consumed_amount_ml !== undefined) fields.push(`actual_ml=${Number(detail.consumed_amount_ml)}`);
  fields.push(`medicine_given=${Boolean(detail.medicine_given)}`);
  if (detail.feed_started_at) fields.push(`prepared_at=${fromDbUtc(detail.feed_started_at)}`);
  if (detail.bottle_expires_at) fields.push(`expires_at=${fromDbUtc(detail.bottle_expires_at)}`);
  return `Recorded through Family OS BB Data API; ${fields.join("; ")}`;
}

function normalizeFeedingMethod(value) {
  const raw = optionalText(value).toLowerCase();
  if (!raw || raw === "milk") return "formula_milk";
  if (FEEDING_METHODS.has(raw)) return raw;
  return "other";
}

function parseDiaperValue(value) {
  let parsed = value;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed || "{}");
    } catch {
      throw new Error("Diaper value_text must be valid JSON.");
    }
  }
  const pee = String(parsed?.pee ?? "").toLowerCase();
  const poo = String(parsed?.poo ?? "").toLowerCase();
  if (!INTENSITIES.has(pee) || !INTENSITIES.has(poo)) throw new Error("Diaper amounts must be none, small, medium, or large.");
  if (pee === "none" && poo === "none") throw new Error("Select at least one diaper amount.");
  return { pee, poo };
}

function normalizeStatus(value) {
  const status = optionalText(value) || "active";
  if (status !== "active" && status !== "deleted") throw new Error("status must be active or deleted.");
  return status;
}

function commonEvent(record, defaults) {
  const type = requireText(record.log_type, "log_type").toLowerCase();
  if (!SUPPORTED_EVENT_TYPES.has(type)) return { unsupported: true, logType: type };
  const eventAt = parseTimestamp(record.event_at, "event_at");
  const createdAt = record.created_at ? parseTimestamp(record.created_at, "created_at") : defaults.now;
  const updatedAt = record.updated_at ? parseTimestamp(record.updated_at, "updated_at") : createdAt;
  return {
    unsupported: false,
    event: {
      event_id: optionalText(record.baby_log_id) || defaults.eventId || `baby_${randomUUID()}`,
      household_id: optionalText(record.household_id) || defaults.householdId,
      baby_person_id: optionalText(record.baby_person_id) || defaults.babyPersonId,
      event_type: type,
      event_at: toDbUtc(eventAt),
      recorded_by_person_id: optionalText(record.recorded_by_person_id) || null,
      source: defaults.source,
      status: normalizeStatus(record.status),
      client_request_id: optionalText(record.client_request_id) || null,
      row_version: Number(record.row_version || 1),
      created_at: toDbUtc(createdAt),
      updated_at: toDbUtc(updatedAt),
      created_by: optionalText(record.created_by) || defaults.actor,
      updated_by: optionalText(record.updated_by) || defaults.actor,
      notes: optionalText(record.description) || null,
    },
  };
}

export function mapLegacyRecord(record, defaults) {
  const mapped = commonEvent(record, defaults);
  if (mapped.unsupported) return mapped;
  const { event } = mapped;

  if (event.event_type === "feeding") {
    const remarks = parseRemarks(record.remarks);
    const consumed = asFiniteNumber(record.value_number, "feeding value_number", { optional: true });
    const prepared = remarks.preparedMl;
    if (consumed !== null && (consumed < 0 || consumed > 2000)) throw new Error("Feeding amount must be between 0 and 2000 ml.");
    if (prepared !== null && prepared < 0) throw new Error("prepared_ml cannot be negative.");
    if (prepared !== null && consumed !== null && consumed > prepared) throw new Error("actual milk cannot exceed prepared milk.");
    const startedAt = record.started_at ? parseTimestamp(record.started_at, "started_at", { optional: true }) : (remarks.preparedAt ? parseTimestamp(remarks.preparedAt, "prepared_at") : null);
    const endedAt = record.ended_at ? parseTimestamp(record.ended_at, "ended_at", { optional: true }) : null;
    if (startedAt && endedAt && endedAt < startedAt) throw new Error("ended_at cannot be before started_at.");
    return {
      event,
      detail: {
        type: "feeding",
        feeding_method: normalizeFeedingMethod(record.log_subtype),
        prepared_amount_ml: prepared,
        consumed_amount_ml: consumed,
        feed_started_at: startedAt ? toDbUtc(startedAt) : null,
        feed_ended_at: endedAt ? toDbUtc(endedAt) : null,
        bottle_expires_at: remarks.expiresAt ? toDbUtc(remarks.expiresAt, "expires_at") : null,
        medicine_given: remarks.medicineGiven,
      },
    };
  }

  if (event.event_type === "diaper") {
    const diaper = parseDiaperValue(record.value_text);
    return { event, detail: { type: "diaper", pee_intensity: diaper.pee, poo_intensity: diaper.poo } };
  }

  const temperature = asFiniteNumber(record.value_number, "temperature value_number");
  if (temperature < 30 || temperature > 45) throw new Error("Temperature must be between 30.0 and 45.0 Celsius.");
  return { event, detail: { type: "temperature", temperature_celsius: Number(temperature.toFixed(1)), measurement_method: null, device_label: null } };
}

export function mapPwaPayload(payload, defaults) {
  return mapLegacyRecord({
    baby_log_id: defaults.eventId || `baby_${randomUUID()}`,
    household_id: defaults.householdId,
    baby_person_id: payload.baby_person_id || defaults.babyPersonId,
    event_at: payload.event_at || toHongKongTimestamp(defaults.now),
    log_type: payload.log_type,
    log_subtype: payload.log_subtype,
    description: payload.description,
    value_number: payload.value_number,
    value_text: payload.value_text,
    unit: payload.unit,
    started_at: payload.started_at,
    ended_at: payload.ended_at,
    recorded_by_person_id: payload.recorded_by_person_id,
    status: "active",
    client_request_id: payload.client_request_id,
    created_at: toHongKongTimestamp(defaults.now),
    updated_at: toHongKongTimestamp(defaults.now),
    created_by: defaults.actor,
    updated_by: defaults.actor,
    remarks: payload.remarks,
  }, defaults);
}
