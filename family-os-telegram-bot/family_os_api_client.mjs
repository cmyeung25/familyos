import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

export class FamilyOsApiClientError extends Error {
  constructor(message, { code = "client_error", details = {} } = {}) {
    super(message);
    this.name = "FamilyOsApiClientError";
    this.code = code;
    this.details = details;
  }
}

export function parsePayloadArgument(text) {
  try {
    return JSON.parse(text);
  } catch {
    return parseLooseObjectLiteral(text);
  }
}

export function createFamilyOsApiClient({
  workspace,
  actorId = "telegram_codex_bridge",
} = {}) {
  return new FamilyOsApiClient({
    workspace: path.resolve(workspace || process.cwd()),
    actorId,
  });
}

class FamilyOsApiClient {
  constructor({ workspace, actorId }) {
    this.workspace = workspace;
    this.actorId = actorId;
    this.inventorySnapshotCache = null;
    this.environmentLoaded = false;
    this.url = "";
    this.apiKey = "";
  }

  async execute(request) {
    await this.loadEnvironment();
    const prepared = await this.prepareRequest(request);
    let data = await this.callFamilyOsApi(prepared);
    if (isInventoryMutationAction(prepared.action)) {
      this.inventorySnapshotCache = null;
      data = await this.enrichInventoryMutationResponse(prepared.action, data);
    }
    return normalizeApiResponse(data);
  }

  async loadEnvironment() {
    if (this.environmentLoaded) return;

    if (process.env.FAMILY_OS_API_URL && process.env.FAMILY_OS_API_KEY) {
      this.url = process.env.FAMILY_OS_API_URL;
      this.apiKey = process.env.FAMILY_OS_API_KEY;
      this.environmentLoaded = true;
      return;
    }

    const configPath = path.join(this.workspace, "family-os-apps-script", "local-api-config.json");
    if (!fs.existsSync(configPath)) {
      throw new FamilyOsApiClientError("FAMILY_OS_API_URL is not configured.", {
        code: "missing_env",
      });
    }

    const script = [
      "$config = Get-Content -LiteralPath '.\\\\family-os-apps-script\\\\local-api-config.json' -Encoding utf8 -Raw | ConvertFrom-Json",
      "$secureApiKey = ConvertTo-SecureString $config.api_key_dpapi",
      "$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureApiKey)",
      "try {",
      "  Write-Output ([string]$config.api_url)",
      "  Write-Output ([Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr))",
      "} finally {",
      "  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)",
      "}",
    ].join("; ");

    const output = execFileSync("powershell.exe", ["-NoProfile", "-Command", script], {
      cwd: this.workspace,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim().split(/\r?\n/);

    if (!output[0]) {
      throw new FamilyOsApiClientError("FAMILY_OS_API_URL is not configured.", {
        code: "missing_env",
      });
    }
    if (!output[1]) {
      throw new FamilyOsApiClientError("FAMILY_OS_API_KEY is not configured.", {
        code: "missing_env",
      });
    }

    this.url = output[0];
    this.apiKey = output[1];
    process.env.FAMILY_OS_API_URL = this.url;
    process.env.FAMILY_OS_API_KEY = this.apiKey;
    this.environmentLoaded = true;
  }

  async prepareRequest(request) {
    const normalized = {
      action: String(request?.action || "").trim(),
      payload: request?.payload && typeof request.payload === "object" ? structuredClone(request.payload) : {},
      request_text: String(request?.request_text || ""),
    };

    if (!normalized.action) {
      throw new FamilyOsApiClientError("Provide a Family OS action.", {
        code: "invalid_request",
      });
    }

    if (normalized.action === "set_inventory_stock_level") {
      await this.normalizeStockLevelPayload(normalized.payload);
      return normalized;
    }

    if (normalized.action === "record_inventory_purchase_batch") {
      await this.enrichInventoryBatchPayload(normalized.payload, { requireCategory: true });
      return normalized;
    }

    if (normalized.action === "record_inventory_consume_batch") {
      await this.enrichInventoryBatchPayload(normalized.payload, { requireCategory: false });
      return normalized;
    }

    if (normalized.action === "upsert_inventory_item") {
      await this.normalizeInventoryMasterPayload(normalized.payload);
      return normalized;
    }

    if (normalized.action === "update_inventory_expiry_date") {
      await this.normalizeInventoryExpiryUpdatePayload(normalized.payload);
      return normalized;
    }

    if (normalized.action === "merge_inventory_items") {
      normalizeMergeInventoryPayload(normalized.payload);
      return normalized;
    }

    if (normalized.action === "append_task") {
      normalizeAppendTaskPayload(normalized.payload);
      return normalized;
    }

    if (normalized.action === "update_task") {
      normalizeUpdateTaskPayload(normalized.payload);
      return normalized;
    }

    if (normalized.action === "query_tasks") {
      normalizeQueryTasksPayload(normalized.payload);
      return normalized;
    }

    if (normalized.action === "append_baby_log") {
      normalizeAppendBabyLogPayload(normalized.payload);
      return normalized;
    }

    return normalized;
  }

  async callFamilyOsApi(request) {
    const response = await fetch(this.url, {
      method: "POST",
      redirect: "follow",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        api_key: this.apiKey,
        action: request.action,
        payload: request.payload || {},
        request_text: request.request_text || "",
        actor_id: this.actorId,
      }),
    });

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new FamilyOsApiClientError(`Family OS API returned non-JSON response (${response.status}).`, {
        code: "non_json_response",
      });
    }

    if (!response.ok || !data.ok) {
      throw new FamilyOsApiClientError(
        String(data?.error || `Family OS API failed (${response.status}).`),
        {
          code: "api_error",
          details: {
            status: response.status,
            response: data,
          },
        },
      );
    }
    return data;
  }

  async enrichInventoryBatchPayload(payload, { requireCategory }) {
    if (!Array.isArray(payload?.items) || payload.items.length === 0) return;
    const snapshot = await this.getInventorySnapshot();

    for (const item of payload.items) {
      if (!item || typeof item !== "object") continue;
      if (!item.item_name) {
        item.item_name = firstNonEmptyString(
          item.item_name,
          item.name,
          item.title,
          item.subject,
          item.product_name,
        );
      }
      if (item.quantity === undefined || item.quantity === null || item.quantity === "") {
        const quantityAlias = firstNonEmptyString(item.quantity, item.qty, item.amount, item.remaining, item.stock);
        if (quantityAlias) item.quantity = Number(quantityAlias);
      }
      if (!item.expiry_date) {
        item.expiry_date = firstNonEmptyString(
          item.expiry_date,
          item.expiry,
          item.expiry_at,
          item.expiryDate,
          item.best_before,
        );
      }
      if (!item.item_key) {
        item.item_key = firstNonEmptyString(item.item_key, item.key, item.slug);
      }
      if (!item.category) {
        item.category = firstNonEmptyString(item.category, item.type);
      }
      if (item.unit) {
        item.unit = normalizeInventoryUnitAlias(item.unit);
      } else {
        item.unit = normalizeInventoryUnitAlias(firstNonEmptyString(item.quantity_unit, item.stock_unit, item.uom));
      }
      if (item.category) {
        item.category = normalizeInventoryCategoryAlias(item.category);
      }
      const match = resolveInventoryMatch(snapshot, item.item_name, {
        preferredUnit: item.unit,
        preferredCategory: item.category,
        requireExisting: !requireCategory,
      });
      if (match.type === "ambiguous") {
        throw buildInventoryMatchError("inventory_ambiguous", item.item_name, match.candidates);
      }
      if (match.type === "none") {
        if (!requireCategory) {
          throw buildInventoryMatchError("inventory_unknown", item.item_name, match.candidates || []);
        }
        continue;
      }
      const existing = match.row;
      if (!existing) continue;
      item.item_id = item.item_id || existing.item_id;
      item.item_key = item.item_key || existing.item_id;
      item.item_name = existing.item_name;
      item.unit = item.unit || existing.unit;
      if (requireCategory) {
        item.category = item.category || existing.category;
      }
    }
  }

  async normalizeStockLevelPayload(payload) {
    applyStockLevelAliases(payload);
    await this.normalizeExistingInventorySubject(payload);
    await this.normalizePercentRemainingToFractionalContainer(payload);
  }

  async normalizeInventoryMasterPayload(payload) {
    if (!payload || typeof payload !== "object") return;
    if (!payload.item_name) {
      payload.item_name = firstNonEmptyString(
        payload.item_name,
        payload.name,
        payload.title,
        payload.subject,
        payload.product_name,
      );
    }
    if (!payload.item_key) {
      payload.item_key = firstNonEmptyString(payload.item_key, payload.key, payload.slug);
    }
    if (!payload.category) {
      payload.category = firstNonEmptyString(payload.category, payload.type);
    }
    if (!payload.unit) {
      payload.unit = firstNonEmptyString(payload.unit, payload.quantity_unit, payload.stock_unit, payload.uom);
    }
    if (payload.unit) {
      payload.unit = normalizeInventoryUnitAlias(payload.unit);
    }
    if (payload.category) {
      payload.category = normalizeInventoryCategoryAlias(payload.category);
    }

    const existing = payload.item_id ? await this.findExistingInventoryItem(payload) : null;
    if (existing) {
      payload.item_name = payload.item_name || existing.item_name;
      payload.unit = payload.unit || existing.unit;
      payload.category = payload.category || existing.category;
      payload.target_group = payload.target_group || existing.target_group;
      payload.canonical_item_name = payload.canonical_item_name || existing.canonical_item_name || existing.item_name;
      payload.brand_name = payload.brand_name || existing.brand_name;
      payload.preferred_brand = payload.preferred_brand || existing.preferred_brand;
      payload.status = payload.status || existing.status || "active";
      return;
    }

    const snapshot = await this.getInventorySnapshot();
    const match = resolveInventoryMatch(snapshot, payload.item_name, {
      preferredUnit: payload.unit,
      preferredCategory: payload.category,
      requireExisting: false,
      creatingNewItem: true,
    });
    if (match.type === "ambiguous") {
      throw buildInventoryMatchError("inventory_ambiguous", payload.item_name, match.candidates);
    }
    if (!payload.canonical_item_name && payload.item_name) {
      payload.canonical_item_name = String(payload.item_name).trim();
    }
    if (!payload.target_group) {
      payload.target_group = inferInventoryTargetGroup(payload);
    }
    if (match.row) {
      payload.item_id = match.row.item_id;
      payload.item_name = match.row.item_name;
      payload.unit = payload.unit || match.row.unit;
      payload.category = payload.category || match.row.category;
      payload.target_group = payload.target_group || match.row.target_group;
      payload.canonical_item_name = payload.canonical_item_name || match.row.canonical_item_name || match.row.item_name;
      payload.brand_name = payload.brand_name || match.row.brand_name;
      payload.preferred_brand = payload.preferred_brand || match.row.preferred_brand;
      payload.status = payload.status || match.row.status || "active";
      return;
    }

    if (!payload.item_key && payload.item_name) {
      payload.item_key = buildInventoryItemKey(payload.item_name);
    }
    payload.status = payload.status || "active";
  }

  async normalizeInventoryExpiryUpdatePayload(payload) {
    if (!payload || typeof payload !== "object") return;
    if (!payload.item_name) {
      payload.item_name = firstNonEmptyString(
        payload.item_name,
        payload.name,
        payload.title,
        payload.subject,
        payload.product_name,
      );
    }
    if (!payload.item_id) {
      payload.item_id = firstNonEmptyString(payload.item_id, payload.item_key, payload.key, payload.slug);
    }
    if (!payload.next_expiry_date) {
      payload.next_expiry_date = firstNonEmptyString(
        payload.next_expiry_date,
        payload.expiry_date,
        payload.expiry,
        payload.expiry_at,
        payload.expiryDate,
        payload.date,
        payload.when,
      );
    }

    const existing = await this.findExistingInventoryItem(payload);
    if (existing) {
      payload.item_id = payload.item_id || existing.item_id;
      payload.item_name = existing.item_name;
    } else if (payload.item_name) {
      const snapshot = await this.getInventorySnapshot();
      const match = resolveInventoryMatch(snapshot, payload.item_name, {
        requireExisting: true,
      });
      if (match.type === "ambiguous") {
        throw buildInventoryMatchError("inventory_ambiguous", payload.item_name, match.candidates);
      }
      if (!match.row) {
        throw buildInventoryMatchError("inventory_unknown", payload.item_name, match.candidates || []);
      }
      payload.item_id = match.row.item_id;
      payload.item_name = match.row.item_name;
    }

    delete payload.name;
    delete payload.title;
    delete payload.subject;
    delete payload.product_name;
    delete payload.item_key;
    delete payload.key;
    delete payload.slug;
    delete payload.expiry_date;
    delete payload.expiry;
    delete payload.expiry_at;
    delete payload.expiryDate;
    delete payload.date;
    delete payload.when;

    const allowedKeys = new Set([
      "item_id",
      "item_name",
      "next_expiry_date",
      "remarks",
    ]);
    for (const key of Object.keys(payload)) {
      if (!allowedKeys.has(key)) {
        delete payload[key];
      }
    }
  }

  async normalizeExistingInventorySubject(payload) {
    if (!payload || typeof payload !== "object") return;
    const existing = await this.findExistingInventoryItem(payload);
    if (existing) {
      payload.item_id = payload.item_id || existing.item_id;
      payload.item_name = existing.item_name;
      payload.unit = payload.unit || existing.unit;
      return;
    }
    if (!payload.item_name) return;
    const snapshot = await this.getInventorySnapshot();
    const match = resolveInventoryMatch(snapshot, payload.item_name, {
      preferredUnit: payload.unit,
      requireExisting: true,
    });
    if (match.type === "ambiguous") {
      throw buildInventoryMatchError("inventory_ambiguous", payload.item_name, match.candidates);
    }
    if (match.row) {
      payload.item_id = match.row.item_id;
      payload.item_name = match.row.item_name;
      payload.unit = payload.unit || match.row.unit;
      return;
    }
    throw buildInventoryMatchError("inventory_unknown", payload.item_name, match.candidates || []);
  }

  async normalizePercentRemainingToFractionalContainer(payload) {
    if (payload?.unit !== "percent") return;
    const numericQuantity = Number(payload.quantity_on_hand);
    if (!Number.isFinite(numericQuantity)) return;
    const existing = await this.findExistingInventoryItem(payload);
    if (!existing || existing.unit !== "bottle") return;
    payload.quantity_on_hand = roundToThreeDecimals(numericQuantity / 100);
    payload.unit = "bottle";
    payload.remarks = appendNormalizationRemark(
      payload.remarks,
      `Converted ${numericQuantity}% remaining into ${payload.quantity_on_hand} bottle.`,
    );
  }

  async findExistingInventoryItem(payload) {
    const snapshot = await this.getInventorySnapshot();
    if (payload.item_id) {
      const byId = snapshot.find((row) => String(row.item_id || "").trim() === String(payload.item_id || "").trim());
      if (byId) return byId;
    }
    if (payload.item_name) {
      const exact = snapshot.find((row) => normalizeLookupText(row.item_name) === normalizeLookupText(payload.item_name));
      if (exact) return exact;
    }
    return null;
  }

  async getInventorySnapshot() {
    await this.loadEnvironment();
    if (this.inventorySnapshotCache) return this.inventorySnapshotCache;
    const response = await this.callFamilyOsApi({
      action: "get_inventory_snapshot",
      payload: {},
      request_text: "Direct client inventory enrichment preflight",
    });
    this.inventorySnapshotCache = Array.isArray(response?.result) ? response.result : [];
    return this.inventorySnapshotCache;
  }

  async enrichInventoryMutationResponse(action, data) {
    const normalizedAction = String(action || "").trim();
    if (!data || typeof data !== "object") return data;
    if (!["record_inventory_purchase_batch", "record_inventory_consume_batch", "set_inventory_stock_level", "upsert_inventory_item", "update_inventory_expiry_date"].includes(normalizedAction)) {
      return data;
    }

    const snapshot = await this.getInventorySnapshot();
    const cloned = structuredClone(data);

    if (["set_inventory_stock_level", "upsert_inventory_item", "update_inventory_expiry_date"].includes(normalizedAction) && cloned.result && typeof cloned.result === "object") {
      cloned.result = enrichInventoryRowWithSnapshot(cloned.result, snapshot);
      return cloned;
    }

    if (Array.isArray(cloned.result?.items)) {
      cloned.result.items = cloned.result.items.map((item) => enrichInventoryRowWithSnapshot(item, snapshot));
    }
    return cloned;
  }
}

function isInventoryMutationAction(action) {
  return new Set([
    "record_inventory_movement",
    "record_inventory_purchase_batch",
    "record_inventory_consume_batch",
    "merge_inventory_items",
    "upsert_inventory_item",
    "set_inventory_stock_level",
    "update_inventory_expiry_date",
  ]).has(String(action || ""));
}

function applyStockLevelAliases(payload) {
  if (payload.quantity_on_hand === undefined) {
    if (payload.quantity !== undefined) payload.quantity_on_hand = payload.quantity;
    else if (payload.current_stock !== undefined) payload.quantity_on_hand = payload.current_stock;
    else if (payload.stock_level !== undefined) payload.quantity_on_hand = payload.stock_level;
    else if (payload.percent !== undefined) payload.quantity_on_hand = payload.percent;
  }
  if (String(payload.unit || "").trim() === "%") {
    payload.unit = "percent";
  } else if (payload.unit) {
    payload.unit = normalizeInventoryUnitAlias(payload.unit);
  }
  delete payload.quantity;
  delete payload.current_stock;
  delete payload.stock_level;
  delete payload.percent;

  const allowedKeys = new Set([
    "item_id",
    "item_name",
    "item_key",
    "unit",
    "quantity_on_hand",
    "event_at",
    "remarks",
  ]);
  for (const key of Object.keys(payload)) {
    if (!allowedKeys.has(key)) {
      delete payload[key];
    }
  }
}

function normalizeAppendTaskPayload(payload) {
  if (!payload || typeof payload !== "object") return;

  if (!payload.task_name) {
    payload.task_name = firstNonEmptyString(
      payload.task_name,
      payload.title,
      payload.name,
      payload.subject,
    );
  }
  if (!payload.due_at) {
    payload.due_at = firstNonEmptyString(
      payload.due_at,
      payload.due_date,
      payload.datetime,
      payload.scheduled_at,
      payload.remind_at,
    );
  }
  if (!payload.source_type && payload.source) {
    payload.source_type = String(payload.source).trim();
  }
  if (!payload.owner_person_id) {
    payload.owner_person_id = firstNonEmptyString(
      payload.owner_person_id,
      payload.owner,
      payload.person_id,
    );
  }
  if (!payload.category) {
    payload.category = inferTaskCategory(payload);
  }
  if (payload.priority) {
    payload.priority = normalizeTaskPriority(payload.priority);
  }

  delete payload.title;
  delete payload.name;
  delete payload.subject;
  delete payload.due_date;
  delete payload.datetime;
  delete payload.scheduled_at;
  delete payload.remind_at;
  delete payload.source;
  delete payload.owner;
  delete payload.person_id;

  const allowedKeys = new Set([
    "category",
    "task_name",
    "description",
    "owner_person_id",
    "due_at",
    "priority",
    "status",
    "recurrence",
    "recurrence_notes",
    "related_person_id",
    "related_item_id",
    "source_type",
    "source_id",
    "completed_at",
    "remarks",
  ]);
  for (const key of Object.keys(payload)) {
    if (!allowedKeys.has(key)) {
      delete payload[key];
    }
  }
}

function normalizeMergeInventoryPayload(payload) {
  if (!payload || typeof payload !== "object") return;

  payload.keep_item_name = firstNonEmptyString(
    payload.keep_item_name,
    payload.keep_name,
    payload.primary_item_name,
    payload.keep,
  );
  payload.merge_item_name = firstNonEmptyString(
    payload.merge_item_name,
    payload.merge_name,
    payload.source_item_name,
    payload.duplicate_item_name,
    payload.merge,
  );
  payload.merged_item_name = firstNonEmptyString(
    payload.merged_item_name,
    payload.canonical_name,
    payload.final_item_name,
    payload.keep_item_name,
  );

  delete payload.keep_name;
  delete payload.primary_item_name;
  delete payload.keep;
  delete payload.merge_name;
  delete payload.source_item_name;
  delete payload.duplicate_item_name;
  delete payload.merge;
  delete payload.canonical_name;
  delete payload.final_item_name;

  const allowedKeys = new Set([
    "keep_item_id",
    "keep_item_name",
    "merge_item_id",
    "merge_item_name",
    "merged_item_name",
    "remarks",
  ]);
  for (const key of Object.keys(payload)) {
    if (!allowedKeys.has(key)) {
      delete payload[key];
    }
  }
}

function normalizeUpdateTaskPayload(payload) {
  if (!payload || typeof payload !== "object") return;
  const promotedPatch = {};
  const patchableKeys = [
    "category",
    "task_name",
    "title",
    "name",
    "subject",
    "description",
    "owner_person_id",
    "owner",
    "person_id",
    "due_at",
    "due_date",
    "datetime",
    "scheduled_at",
    "remind_at",
    "priority",
    "status",
    "recurrence",
    "recurrence_notes",
    "related_person_id",
    "related_item_id",
    "source_type",
    "source",
    "source_id",
    "completed_at",
    "remarks",
  ];
  for (const key of patchableKeys) {
    if (payload[key] !== undefined) {
      promotedPatch[key] = payload[key];
      delete payload[key];
    }
  }
  if (!payload.patch || typeof payload.patch !== "object") {
    payload.patch = promotedPatch;
  } else {
    payload.patch = { ...promotedPatch, ...payload.patch };
  }
  const patch = payload.patch;

  const aliasedTaskName = firstNonEmptyString(
    patch.task_name,
    patch.title,
    patch.name,
    patch.subject,
  );
  if (aliasedTaskName) {
    patch.task_name = aliasedTaskName;
  }

  const aliasedDueAt = firstNonEmptyString(
    patch.due_at,
    patch.due_date,
    patch.datetime,
    patch.scheduled_at,
    patch.remind_at,
  );
  if (aliasedDueAt) {
    patch.due_at = aliasedDueAt;
  }

  if (!patch.source_type && patch.source) {
    patch.source_type = String(patch.source).trim();
  }

  const aliasedOwner = firstNonEmptyString(
    patch.owner_person_id,
    patch.owner,
    patch.person_id,
  );
  if (aliasedOwner) {
    patch.owner_person_id = aliasedOwner;
  }

  if (!patch.category && (String(patch.task_name || "").trim() || String(patch.description || "").trim())) {
    const inferredCategory = inferTaskCategory(patch);
    if (inferredCategory) {
      patch.category = inferredCategory;
    }
  }

  if (patch.priority) {
    patch.priority = normalizeTaskPriority(patch.priority);
  }

  delete patch.title;
  delete patch.name;
  delete patch.subject;
  delete patch.due_date;
  delete patch.datetime;
  delete patch.scheduled_at;
  delete patch.remind_at;
  delete patch.source;
  delete patch.owner;
  delete patch.person_id;

  const allowedKeys = new Set([
    "category",
    "task_name",
    "description",
    "owner_person_id",
    "due_at",
    "priority",
    "status",
    "recurrence",
    "recurrence_notes",
    "related_person_id",
    "related_item_id",
    "source_type",
    "source_id",
    "completed_at",
    "remarks",
  ]);
  for (const key of Object.keys(patch)) {
    if (!allowedKeys.has(key)) {
      delete patch[key];
    }
  }
}

function normalizeQueryTasksPayload(payload) {
  if (!payload || typeof payload !== "object") return;

  if (!payload.from) {
    payload.from = firstNonEmptyString(
      payload.from,
      payload.from_date,
      payload.date_from,
      payload.start_at,
      payload.start_date,
    );
  }

  if (!payload.to) {
    payload.to = firstNonEmptyString(
      payload.to,
      payload.to_date,
      payload.date_to,
      payload.end_at,
      payload.end_date,
    );
  }

  if (!payload.status && String(payload.query || "").trim()) {
    payload.status = "open";
  }

  if (!payload.limit && String(payload.query || "").trim()) {
    payload.limit = 20;
  }

  delete payload.query;
  delete payload.task_name;
  delete payload.title;
  delete payload.name;
  delete payload.subject;
  delete payload.due_at;
  delete payload.date;
  delete payload.when;
  delete payload.from_date;
  delete payload.date_from;
  delete payload.start_at;
  delete payload.start_date;
  delete payload.to_date;
  delete payload.date_to;
  delete payload.end_at;
  delete payload.end_date;

  const allowedKeys = new Set([
    "limit",
    "category",
    "status",
    "owner_person_id",
    "related_person_id",
    "related_item_id",
    "from",
    "to",
  ]);
  for (const key of Object.keys(payload)) {
    if (!allowedKeys.has(key)) {
      delete payload[key];
    }
  }
}

function normalizeAppendBabyLogPayload(payload) {
  if (!payload || typeof payload !== "object") return;

  if (!payload.log_type) {
    payload.log_type = firstNonEmptyString(payload.log_type, payload.type, payload.event_type);
  }
  if (!payload.log_subtype) {
    payload.log_subtype = firstNonEmptyString(payload.log_subtype, payload.subtype, payload.event_subtype);
  }
  if (payload.value_number === undefined || payload.value_number === null || payload.value_number === "") {
    const numericAlias = firstNonEmptyString(payload.value_number, payload.value, payload.amount, payload.temperature, payload.ml);
    if (numericAlias) {
      const numericValue = Number(numericAlias);
      if (Number.isFinite(numericValue)) {
        payload.value_number = numericValue;
      }
    }
  }
  if (!payload.value_text) {
    payload.value_text = firstNonEmptyString(
      payload.value_text,
      payload.output,
      payload.result,
      payload.text_value,
    );
  }
  if (payload.unit) {
    payload.unit = normalizeBabyLogUnit(payload.unit);
  } else {
    payload.unit = normalizeBabyLogUnit(firstNonEmptyString(payload.quantity_unit, payload.uom));
  }

  const logType = String(payload.log_type || "").trim().toLowerCase();
  const noteText = firstNonEmptyString(payload.note, payload.description, payload.remarks);

  if (logType === "feeding") {
    payload.log_subtype = payload.log_subtype || "milk";
    if (!payload.unit) {
      payload.unit = "ml";
    }
    if (!payload.description && Number.isFinite(Number(payload.value_number))) {
      payload.description = `BB 飲奶 ${payload.value_number} ${payload.unit}`;
    }
  } else if (logType === "diaper") {
    payload.value_text = normalizeDiaperValueText(payload.value_text || noteText);
    if (!payload.description && payload.value_text) {
      payload.description = `BB 換片：${payload.value_text}`;
    }
  } else if (logType === "temperature") {
    payload.unit = payload.unit || "celsius";
    if (!payload.description && Number.isFinite(Number(payload.value_number))) {
      payload.description = `BB 體溫 ${payload.value_number} 度`;
    }
  } else if (["vaccination", "clinic_visit", "doctor_visit", "note"].includes(logType)) {
    if (!payload.description && noteText) {
      payload.description = noteText;
    }
  }

  if (!payload.remarks) {
    payload.remarks = "Recorded through Family OS API";
  }

  delete payload.type;
  delete payload.event_type;
  delete payload.subtype;
  delete payload.event_subtype;
  delete payload.value;
  delete payload.amount;
  delete payload.temperature;
  delete payload.ml;
  delete payload.output;
  delete payload.result;
  delete payload.text_value;
  delete payload.note;
  delete payload.quantity_unit;
  delete payload.uom;

  const allowedKeys = new Set([
    "event_at",
    "log_type",
    "log_subtype",
    "description",
    "value_number",
    "value_text",
    "unit",
    "started_at",
    "ended_at",
    "remarks",
  ]);
  for (const key of Object.keys(payload)) {
    if (!allowedKeys.has(key)) {
      delete payload[key];
    }
  }
}

function normalizeTaskPriority(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return "";
  if (text === "normal") return "medium";
  if (text === "urgent") return "high";
  return text;
}

function firstNonEmptyString(...values) {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) return text;
  }
  return "";
}

function inferTaskCategory(payload) {
  const text = [
    payload.task_name,
    payload.description,
    payload.remarks,
    payload.source_type,
  ].map((value) => String(value || "").trim().toLowerCase()).join(" ");
  if (/(產檢|醫生|醫院|覆診|疫苗|clinic|doctor|hospital|medical)/i.test(text)) {
    return "medical";
  }
  if (/(bb|baby|奶|換片|diaper|feeding)/i.test(text)) {
    return "baby";
  }
  if (/(租|樓|睇樓|按揭|property|mortgage)/i.test(text)) {
    return "property";
  }
  if (/(錢|交費|帳單|salary|expense|income|budget|finance)/i.test(text)) {
    return "finance";
  }
  if (/(工人|helper|姐姐|caregiver)/i.test(text)) {
    return "helper";
  }
  if (/(狗|貓|pet)/i.test(text)) {
    return "pet";
  }
  if (/(文件|passport|證件|document)/i.test(text)) {
    return "document";
  }
  return "home";
}

function normalizeInventoryCategoryAlias(category) {
  const raw = String(category || "").trim().toLowerCase();
  const aliases = {
    baby_diaper: "baby_consumable",
    baby_feeding: "baby_consumable",
    bb_personal_care: "personal_care",
    bb_household_cleaning: "household_cleaning",
    "bb用品": "baby_consumable",
    "嬰兒用品": "baby_consumable",
    "個人護理": "personal_care",
    "家居清潔": "household_cleaning",
    "清潔用品": "household_cleaning",
    "家居用品": "other",
    "家庭用品": "other",
    "家居雜物": "other",
    "日用品": "other",
    "雜貨": "other",
    "其他": "other",
    "食物": "groceries",
    "食品": "groceries",
    "乾貨": "groceries",
  };
  return aliases[raw] || raw;
}

function normalizeBabyLogUnit(unit) {
  const raw = String(unit || "").trim().toLowerCase();
  const aliases = {
    ml: "ml",
    毫升: "ml",
    cc: "ml",
    度: "celsius",
    c: "celsius",
    celsius: "celsius",
    小時: "hour",
    小时: "hour",
    hour: "hour",
    hours: "hour",
    分鐘: "minute",
    分钟: "minute",
    min: "minute",
    mins: "minute",
    minute: "minute",
    minutes: "minute",
  };
  return aliases[raw] || raw;
}

function normalizeDiaperValueText(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  if (/(兩樣|两样|both|mix|mixed)/i.test(raw)) return "both";
  if (/(大便|便便|stool|poo|poop)/i.test(raw)) return "stool";
  if (/(小便|尿|pee|urine|wet)/i.test(raw)) return "urine";
  return raw;
}

function inferInventoryTargetGroup(payload = {}) {
  const text = [
    payload.item_name,
    payload.canonical_item_name,
    payload.brand_name,
    payload.remarks,
  ].map((value) => String(value || "").trim().toLowerCase()).join(" ");
  const category = normalizeInventoryCategoryAlias(payload.category || "");
  if (category === "baby_consumable") return "baby";
  if (category === "pet_food" || category === "pet_litter" || /(cat|dog|pet|貓|狗)/i.test(text)) return "pet";
  if (/(bb|baby|嬰|初生|奶樽|口水肩|pat pat|尿片)/i.test(text)) return "baby";
  if (/(helper|工人|caregiver)/i.test(text)) return "helper";
  if (category === "groceries" || category === "household_cleaning") return "shared";
  if (category === "personal_care") return "family";
  return "shared";
}

function buildInventoryItemKey(itemName) {
  const ascii = String(itemName || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (ascii) return ascii;
  return `item_${Date.now()}`;
}

export function normalizeInventoryUnitAlias(unit) {
  const raw = String(unit || "").trim().toLowerCase();
  const aliases = {
    個: "piece",
    件: "piece",
    粒: "piece",
    隻: "piece",
    片: "piece",
    piece: "piece",
    pieces: "piece",
    包: "pack",
    pack: "pack",
    packs: "pack",
    盒: "box",
    box: "box",
    boxes: "box",
    樽: "bottle",
    支: "bottle",
    瓶: "bottle",
    bottle: "bottle",
    bottles: "bottle",
    罐: "can",
    can: "can",
    cans: "can",
    杯: "cup",
    cup: "cup",
    cups: "cup",
    卷: "roll",
    roll: "roll",
    rolls: "roll",
    "%": "percent",
    percent: "percent",
    percentage: "percent",
    ml: "ml",
  };
  return aliases[raw] || raw;
}

function normalizeLookupText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^\p{L}\p{N}\u4e00-\u9fff]+/gu, "");
}

export function resolveInventoryMatch(snapshot, itemName, {
  preferredUnit = "",
  preferredCategory = "",
  requireExisting = false,
  creatingNewItem = false,
} = {}) {
  const query = normalizeLookupText(itemName);
  if (!query) return { type: "none", row: null, candidates: [] };
  const scored = snapshot
    .map((row) => ({ row, score: scoreInventoryCandidate(query, row, { preferredUnit, preferredCategory }) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score);

  const exact = scored.find((entry) => normalizeLookupText(entry.row.item_name) === query);
  const strongCandidates = scored.filter((entry) => entry.score >= 70).slice(0, 3);
  const suggestibleCandidates = scored.filter((entry) => entry.score >= 35).slice(0, 3);

  if (exact && !shouldTreatExactAsGeneric(query, exact.row, scored.map((entry) => entry.row))) {
    return { type: "exact", row: exact.row, candidates: strongCandidates.map((entry) => entry.row) };
  }
  if (exact && shouldTreatExactAsGeneric(query, exact.row, scored.map((entry) => entry.row))) {
    return { type: "ambiguous", row: null, candidates: scored.slice(0, 3).map((entry) => entry.row) };
  }
  if (creatingNewItem && suggestibleCandidates.length > 0) {
    const bestSuggestible = suggestibleCandidates[0];
    if (shouldCreateDistinctInventoryItem(query, bestSuggestible.row)) {
      return { type: "none", row: null, candidates: suggestibleCandidates.map((entry) => entry.row) };
    }
    return { type: "ambiguous", row: null, candidates: suggestibleCandidates.map((entry) => entry.row) };
  }
  if (strongCandidates.length === 1) {
    return { type: "strong", row: strongCandidates[0].row, candidates: strongCandidates.map((entry) => entry.row) };
  }
  if (strongCandidates.length > 1) {
    const [best, second] = strongCandidates;
    if (best.score - second.score >= 12 && !creatingNewItem) {
      return { type: "strong", row: best.row, candidates: strongCandidates.map((entry) => entry.row) };
    }
    return { type: "ambiguous", row: null, candidates: strongCandidates.map((entry) => entry.row) };
  }
  if (requireExisting) {
    return { type: "none", row: null, candidates: suggestibleCandidates.map((entry) => entry.row) };
  }
  return { type: "none", row: null, candidates: suggestibleCandidates.map((entry) => entry.row) };
}

function scoreInventoryCandidate(query, row, { preferredUnit = "", preferredCategory = "" } = {}) {
  const candidate = normalizeLookupText(row?.item_name);
  if (!candidate) return 0;
  let score = 0;
  if (candidate === query) score += 100;
  if (candidate.includes(query) || query.includes(candidate)) score += 55;
  score += Math.round(diceCoefficient(query, candidate) * 40);
  if (preferredUnit && normalizeInventoryUnitAlias(preferredUnit) === normalizeInventoryUnitAlias(row.unit)) score += 6;
  if (preferredCategory && String(preferredCategory || "").trim() && String(preferredCategory).trim() === String(row.category || "").trim()) score += 4;
  if (Number(row.quantity_on_hand) > 0) score += 4;
  if (isGenericInventoryQuery(query) && candidate.length > query.length) score += 10;
  if (isGenericInventoryQuery(query) && candidate.includes(query) && candidate.length > query.length) score += 15;
  if (isGenericInventoryQuery(query) && candidate === query) score -= 8;
  return score;
}

function shouldTreatExactAsGeneric(query, exactRow, candidateRows) {
  if (!isGenericInventoryQuery(query)) return false;
  return candidateRows.some((row) => row.item_id !== exactRow.item_id && normalizeLookupText(row.item_name).includes(query) && normalizeLookupText(row.item_name).length > query.length);
}

function shouldCreateDistinctInventoryItem(query, candidateRow) {
  if (!candidateRow?.item_name) return false;
  if (isGenericInventoryQuery(query)) return false;
  return hasStructuredInventoryTokenDifference(query, candidateRow.item_name);
}

function hasStructuredInventoryTokenDifference(left, right) {
  const leftTokens = extractInventoryNameTokens(left);
  const rightTokens = extractInventoryNameTokens(right);
  if (leftTokens.length === 0 || rightTokens.length === 0) return false;

  const leftHan = leftTokens.filter(isHanToken);
  const rightHan = rightTokens.filter(isHanToken);
  const leftLatin = leftTokens.filter((token) => !isHanToken(token));
  const rightLatin = rightTokens.filter((token) => !isHanToken(token));

  if (leftHan.length === 0 || rightHan.length === 0 || leftLatin.length === 0 || rightLatin.length === 0) {
    return false;
  }

  if (leftHan.join("") !== rightHan.join("")) {
    return false;
  }

  return leftLatin.join("|") !== rightLatin.join("|");
}

function extractInventoryNameTokens(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .match(/[\p{Script=Han}]+|[a-z0-9]+/gu) || [];
}

function isHanToken(token) {
  return /^[\p{Script=Han}]+$/u.test(String(token || ""));
}

function isGenericInventoryQuery(query) {
  const value = String(query || "");
  return value.length <= 2 || ["蛋", "油", "麵", "奶", "膏", "紙"].includes(value);
}

function diceCoefficient(left, right) {
  if (!left || !right) return 0;
  if (left === right) return 1;
  const leftBigrams = buildBigrams(left);
  const rightBigrams = buildBigrams(right);
  if (leftBigrams.length === 0 || rightBigrams.length === 0) {
    return left === right ? 1 : 0;
  }
  const rightCounts = new Map();
  for (const gram of rightBigrams) {
    rightCounts.set(gram, (rightCounts.get(gram) || 0) + 1);
  }
  let overlap = 0;
  for (const gram of leftBigrams) {
    const count = rightCounts.get(gram) || 0;
    if (count > 0) {
      overlap += 1;
      rightCounts.set(gram, count - 1);
    }
  }
  return (2 * overlap) / (leftBigrams.length + rightBigrams.length);
}

function buildBigrams(value) {
  const source = String(value || "");
  if (source.length < 2) return [source].filter(Boolean);
  const grams = [];
  for (let index = 0; index < source.length - 1; index += 1) {
    grams.push(source.slice(index, index + 2));
  }
  return grams;
}

function buildInventoryMatchError(code, itemName, candidates = []) {
  return new FamilyOsApiClientError(
    code === "inventory_ambiguous"
      ? buildInventoryAmbiguityMessage(itemName, candidates)
      : buildUnknownInventoryItemMessage(itemName, candidates),
    {
      code,
      details: {
        item_name: itemName,
        candidates: candidates.map((row) => ({
          item_id: row.item_id,
          item_name: row.item_name,
          category: row.category,
          unit: row.unit,
        })),
      },
    },
  );
}

export function buildInventoryAmbiguityMessage(itemName, candidates = []) {
  const names = candidates.slice(0, 3).map((row) => row.item_name).filter(Boolean);
  if (names.length === 0) {
    return `我未夠把握直接處理「${itemName}」，你可以講返更完整啲嘅存貨名嗎？`;
  }
  if (names.length === 1) {
    return `我見到屋企而家有「${names[0]}」。你係咪想用呢一個？如果唔係，你都可以直接回我另一個存貨名。`;
  }
  return `我見到可能係：${names.join("、")}。你想用邊個？`;
}

export function buildUnknownInventoryItemMessage(itemName, candidates = []) {
  const names = candidates.slice(0, 3).map((row) => row.item_name).filter(Boolean);
  if (names.length === 0) {
    return `我暫時未見過「${itemName}」呢個存貨。呢個係新物品，定其實之前漏記咗？如果係新物品，你可以直接答我例如「${itemName} 係新物品，而家有 3 包」。`;
  }
  if (names.length === 1) {
    return `我暫時未見過「${itemName}」呢個存貨，但我見到比較似「${names[0]}」。如果唔係呢個，你都可以直接話我「${itemName} 係新物品」。`;
  }
  return `我暫時未見過「${itemName}」呢個存貨，但見到可能係：${names.join("、")}。如果都唔係，你可以直接話我「${itemName} 係新物品」。`;
}

function appendNormalizationRemark(current, note) {
  const value = String(current || "").trim();
  if (!value) return note;
  if (value.includes(note)) return value;
  return `${value} ${note}`.trim();
}

function roundToThreeDecimals(value) {
  return Math.round(Number(value) * 1000) / 1000;
}

export function normalizeApiResponse(data) {
  if (!data || typeof data !== "object") return data;
  const cloned = structuredClone(data);
  const action = String(cloned.action || "");
  if (action === "get_inventory_snapshot" && Array.isArray(cloned.result)) {
    cloned.result = cloned.result.map((row) => roundInventoryNumbers(row));
  } else if ((action === "set_inventory_stock_level" || action === "upsert_inventory_item") && cloned.result && typeof cloned.result === "object") {
    cloned.result = roundInventoryNumbers(cloned.result);
  }
  return cloned;
}

function roundInventoryNumbers(row) {
  if (!row || typeof row !== "object") return row;
  const clone = { ...row };
  for (const key of ["quantity_on_hand", "previous_quantity_on_hand", "quantity_delta", "safety_stock"]) {
    if (typeof clone[key] === "number" && Number.isFinite(clone[key])) {
      clone[key] = roundToThreeDecimals(clone[key]);
    }
  }
  return clone;
}

function enrichInventoryRowWithSnapshot(row, snapshot) {
  if (!row || typeof row !== "object") return row;
  const match = findInventorySnapshotRow(snapshot, row);
  if (!match) return row;
  return roundInventoryNumbers({
    ...match,
    ...row,
    item_id: row.item_id || match.item_id,
    item_name: row.item_name || match.item_name,
    unit: row.unit || match.unit,
    category: row.category || match.category,
    quantity_on_hand: match.quantity_on_hand,
    next_expiry_date: row.next_expiry_date || match.next_expiry_date,
  });
}

function findInventorySnapshotRow(snapshot, row) {
  const rows = Array.isArray(snapshot) ? snapshot : [];
  const itemId = String(row?.item_id || row?.item_key || "").trim();
  if (itemId) {
    const byId = rows.find((entry) => String(entry?.item_id || "").trim() === itemId);
    if (byId) return byId;
  }
  const itemName = normalizeLookupText(row?.item_name || "");
  if (!itemName) return null;
  return rows.find((entry) => normalizeLookupText(entry?.item_name || "") === itemName) || null;
}

function parseLooseObjectLiteral(text) {
  const source = String(text || "").trim();
  if (!source) return {};
  let index = 0;

  function error(message) {
    throw new SyntaxError(`${message} at position ${index}`);
  }

  function skipWhitespace() {
    while (index < source.length && /\s/.test(source[index])) index += 1;
  }

  function parseValue() {
    skipWhitespace();
    const char = source[index];
    if (char === "{") return parseObject();
    if (char === "[") return parseArray();
    if (char === "\"" || char === "'") return parseString();
    if (char === "-" || /\d/.test(char || "")) return parseNumber();
    return parseBareword();
  }

  function parseObject() {
    const value = {};
    expect("{");
    skipWhitespace();
    if (source[index] === "}") {
      index += 1;
      return value;
    }
    while (index < source.length) {
      skipWhitespace();
      const key = parseKey();
      skipWhitespace();
      expect(":");
      value[key] = parseValue();
      skipWhitespace();
      if (source[index] === "}") {
        index += 1;
        return value;
      }
      expect(",");
      skipWhitespace();
      if (source[index] === "}") {
        index += 1;
        return value;
      }
    }
    error("Unterminated object");
  }

  function parseArray() {
    const value = [];
    expect("[");
    skipWhitespace();
    if (source[index] === "]") {
      index += 1;
      return value;
    }
    while (index < source.length) {
      value.push(parseValue());
      skipWhitespace();
      if (source[index] === "]") {
        index += 1;
        return value;
      }
      expect(",");
      skipWhitespace();
      if (source[index] === "]") {
        index += 1;
        return value;
      }
    }
    error("Unterminated array");
  }

  function parseString() {
    const quote = source[index];
    index += 1;
    let result = "";
    while (index < source.length) {
      const char = source[index];
      if (char === "\\") {
        const next = source[index + 1];
        if (next == null) error("Invalid escape");
        const escapes = {
          "\"": "\"",
          "'": "'",
          "\\": "\\",
          "/": "/",
          b: "\b",
          f: "\f",
          n: "\n",
          r: "\r",
          t: "\t",
        };
        if (next === "u") {
          const hex = source.slice(index + 2, index + 6);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) error("Invalid unicode escape");
          result += String.fromCharCode(parseInt(hex, 16));
          index += 6;
          continue;
        }
        result += escapes[next] ?? next;
        index += 2;
        continue;
      }
      if (char === quote) {
        index += 1;
        return result;
      }
      result += char;
      index += 1;
    }
    error("Unterminated string");
  }

  function parseNumber() {
    const start = index;
    if (source[index] === "-") index += 1;
    while (/\d/.test(source[index] || "")) index += 1;
    if (source[index] === ".") {
      index += 1;
      while (/\d/.test(source[index] || "")) index += 1;
    }
    if (/[eE]/.test(source[index] || "")) {
      index += 1;
      if (/[+-]/.test(source[index] || "")) index += 1;
      while (/\d/.test(source[index] || "")) index += 1;
    }
    const raw = source.slice(start, index);
    const value = Number(raw);
    if (Number.isNaN(value)) error("Invalid number");
    return value;
  }

  function parseBareword() {
    const start = index;
    while (index < source.length && !/[\s,\]\}]/.test(source[index])) index += 1;
    const raw = source.slice(start, index).trim();
    if (!raw) error("Expected value");
    if (raw === "true") return true;
    if (raw === "false") return false;
    if (raw === "null") return null;
    return raw;
  }

  function parseKey() {
    skipWhitespace();
    const char = source[index];
    if (char === "\"" || char === "'") return parseString();
    const start = index;
    while (index < source.length && !/[\s:]/.test(source[index])) index += 1;
    const key = source.slice(start, index).trim();
    if (!key) error("Expected object key");
    return key;
  }

  function expect(expected) {
    skipWhitespace();
    if (source[index] !== expected) {
      error(`Expected '${expected}'`);
    }
    index += 1;
  }

  const result = parseValue();
  skipWhitespace();
  if (index < source.length) {
    error("Unexpected trailing content");
  }
  return result;
}

export async function runFamilyOsApiClientSelfTest() {
  const strict = parsePayloadArgument("{\"status\":\"open\",\"priority\":\"medium\"}");
  if (strict.status !== "open" || strict.priority !== "medium") {
    throw new Error("Strict JSON payload parsing failed.");
  }
  const loose = parsePayloadArgument("{task_id:tsk_1,patch:{status:cancelled,remarks:'Cancelled after smoke test'}}");
  if (
    loose.task_id !== "tsk_1"
    || loose.patch?.status !== "cancelled"
    || loose.patch?.remarks !== "Cancelled after smoke test"
  ) {
    throw new Error("Loose payload parsing failed.");
  }
  const nested = parsePayloadArgument("{items:[{item_name:'沐浴露',quantity:2,unit:bottle},{item_name:'乳酪',quantity:5,unit:cup,expiry_date:'2026-11-24'}]}");
  if (
    !Array.isArray(nested.items)
    || nested.items.length !== 2
    || nested.items[0]?.unit !== "bottle"
    || nested.items[1]?.expiry_date !== "2026-11-24"
  ) {
    throw new Error("Nested loose payload parsing failed.");
  }
  const stockPayload = { item_name: "沖涼液", quantity: 19, unit: "%" };
  applyStockLevelAliases(stockPayload);
  if (stockPayload.quantity_on_hand !== 19 || stockPayload.unit !== "percent") {
    throw new Error("Stock-level payload normalization failed.");
  }
  if (normalizeInventoryUnitAlias("樽") !== "bottle" || normalizeInventoryUnitAlias("包") !== "pack") {
    throw new Error("Inventory unit alias normalization failed.");
  }
  const appendTaskPayload = {
    title: "產檢",
    due_date: "2026-06-10 11:30:00+08:00",
    priority: "normal",
    source: "telegram",
  };
  normalizeAppendTaskPayload(appendTaskPayload);
  if (
    appendTaskPayload.task_name !== "產檢"
    || appendTaskPayload.due_at !== "2026-06-10 11:30:00+08:00"
    || appendTaskPayload.priority !== "medium"
    || appendTaskPayload.source_type !== "telegram"
    || "title" in appendTaskPayload
  ) {
    throw new Error("Append-task payload normalization failed.");
  }
  const babyLogPayload = {
    type: "vaccination",
    note: "MMR",
  };
  normalizeAppendBabyLogPayload(babyLogPayload);
  if (
    babyLogPayload.log_type !== "vaccination"
    || babyLogPayload.description !== "MMR"
    || babyLogPayload.remarks !== "Recorded through Family OS API"
  ) {
    throw new Error("Baby-log payload normalization failed.");
  }
  const updateTaskPayload = {
    task_id: "tsk_1",
    patch: {
      name: "改咗名",
      due_date: "2026-06-11 09:00:00+08:00",
      priority: "urgent",
    },
  };
  normalizeUpdateTaskPayload(updateTaskPayload);
  if (
    updateTaskPayload.patch.task_name !== "改咗名"
    || updateTaskPayload.patch.due_at !== "2026-06-11 09:00:00+08:00"
    || updateTaskPayload.patch.priority !== "high"
  ) {
    throw new Error("Update-task payload normalization failed.");
  }
  const sparseUpdatePayload = {
    task_id: "tsk_2",
    patch: {
      status: "cancelled",
      remarks: "Cancelled after smoke test",
    },
  };
  normalizeUpdateTaskPayload(sparseUpdatePayload);
  if (
    sparseUpdatePayload.patch.status !== "cancelled"
    || sparseUpdatePayload.patch.remarks !== "Cancelled after smoke test"
    || "task_name" in sparseUpdatePayload.patch
    || "due_at" in sparseUpdatePayload.patch
    || "category" in sparseUpdatePayload.patch
  ) {
    throw new Error("Sparse update-task payload normalization failed.");
  }
  const topLevelUpdatePayload = {
    task_id: "tsk_3",
    due_at: "2026-06-12 10:15:00+08:00",
    status: "open",
  };
  normalizeUpdateTaskPayload(topLevelUpdatePayload);
  if (
    topLevelUpdatePayload.patch?.due_at !== "2026-06-12 10:15:00+08:00"
    || topLevelUpdatePayload.patch?.status !== "open"
  ) {
    throw new Error("Top-level update-task payload promotion failed.");
  }
  const expiryUpdatePayload = {
    item_name: "皇家美素力水奶",
    expiry_date: "2026-12-02",
    noise_field: "x",
  };
  const originalFindExistingInventoryItem = FamilyOsApiClient.prototype.findExistingInventoryItem;
  FamilyOsApiClient.prototype.findExistingInventoryItem = async () => ({
    item_id: "itm_formula_ready",
    item_name: "皇家美素力水奶",
  });
  try {
    const expiryClient = new FamilyOsApiClient({ workspace: process.cwd(), actorId: "self_test" });
    await expiryClient.normalizeInventoryExpiryUpdatePayload(expiryUpdatePayload);
  } finally {
    FamilyOsApiClient.prototype.findExistingInventoryItem = originalFindExistingInventoryItem;
  }
  if (
    expiryUpdatePayload.item_id !== "itm_formula_ready"
    || expiryUpdatePayload.item_name !== "皇家美素力水奶"
    || expiryUpdatePayload.next_expiry_date !== "2026-12-02"
    || "expiry_date" in expiryUpdatePayload
    || "noise_field" in expiryUpdatePayload
  ) {
    throw new Error("Inventory-expiry update payload normalization failed.");
  }
  const queryTaskPayload = {
    query: "6月9號去產檢",
    due_at: "2026-06-09 11:30:00+08:00",
  };
  normalizeQueryTasksPayload(queryTaskPayload);
  if (
    queryTaskPayload.status !== "open"
    || queryTaskPayload.limit !== 20
    || "query" in queryTaskPayload
    || "due_at" in queryTaskPayload
  ) {
    throw new Error("Query-task payload normalization failed.");
  }
  const mergePayload = {
    keep_name: "沐浴露",
    merge_name: "沖涼液",
    canonical_name: "沐浴露",
    ignored_field: "x",
  };
  normalizeMergeInventoryPayload(mergePayload);
  if (
    mergePayload.keep_item_name !== "沐浴露"
    || mergePayload.merge_item_name !== "沖涼液"
    || mergePayload.merged_item_name !== "沐浴露"
    || "ignored_field" in mergePayload
  ) {
    throw new Error("Merge-inventory payload normalization failed.");
  }
  const duplicateSnapshot = [
    { item_id: "itm_egg", item_name: "蛋", unit: "piece", category: "groceries", quantity_on_hand: 0 },
    { item_id: "itm_eggs", item_name: "雞蛋", unit: "piece", category: "groceries", quantity_on_hand: 8 },
  ];
  const duplicateMatch = resolveInventoryMatch(duplicateSnapshot, "蛋", { preferredUnit: "piece", requireExisting: true });
  if (duplicateMatch.type !== "ambiguous") {
    throw new Error("Inventory similarity self-test failed: generic duplicate name should trigger clarification.");
  }
  const batteryAliasCategory = normalizeInventoryCategoryAlias("家居用品");
  if (batteryAliasCategory !== "other") {
    throw new Error("Inventory category alias self-test failed: 家居用品 should normalize to other.");
  }
  const batterySnapshot = [
    { item_id: "itm_aa", item_name: "AA電芯", unit: "piece", category: "other", quantity_on_hand: 8 },
  ];
  const createAaaMatch = resolveInventoryMatch(batterySnapshot, "AAA電芯", {
    preferredUnit: "piece",
    preferredCategory: "other",
    creatingNewItem: true,
  });
  if (createAaaMatch.type !== "none") {
    throw new Error("Inventory similarity self-test failed: AAA電芯 should not silently reuse AA電芯 during new-item bootstrap.");
  }
  const singleCandidatePrompt = buildInventoryAmbiguityMessage("乳酪", [{ item_name: "乳酪" }]);
  if (!singleCandidatePrompt.includes("乳酪")) {
    throw new Error("Inventory suggestion self-test failed: single candidate prompt should mention the likely item.");
  }
  console.log("family_os_api_client self-test passed.");
}

