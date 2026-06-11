const FAMILY_OS = Object.freeze({
  spreadsheetId: "1kyKGz6GuScz3GblIVTq12-L6LqzxAQpBmGZB74nifpc",
  householdId: "hh_home",
  schemaVersion: "family_os_poc_v1",
  timezone: "Asia/Hong_Kong",
});

const WRITE_COLUMNS = Object.freeze({
  inventory_items: [
    "item_id", "household_id", "item_name", "canonical_item_name", "category", "target_group",
    "brand_name", "unit", "safety_stock", "storage_location", "next_expiry_date",
    "preferred_brand", "purchase_channel", "status", "created_at", "updated_at",
    "created_by", "updated_by", "remarks",
  ],
  baby_log: [
    "baby_log_id", "household_id", "event_at", "baby_person_id", "log_type",
    "log_subtype", "description", "value_number", "value_text", "unit",
    "started_at", "ended_at", "related_task_id", "recorded_by_person_id",
    "status", "created_at", "updated_at", "created_by", "updated_by", "remarks",
  ],
  inventory_movements: [
    "movement_id", "household_id", "event_at", "item_id", "movement_type",
    "quantity_delta", "expiry_date", "unit_cost_hkd", "related_transaction_id",
    "status", "created_at", "updated_at", "created_by", "updated_by", "remarks",
  ],
  finance_transactions: [
    "transaction_id", "household_id", "transaction_date", "type", "category",
    "sub_category", "item_name", "amount", "currency", "fx_rate_to_hkd",
    "payer_person_id", "is_recurring", "payment_method", "related_property_id",
    "status", "created_at", "updated_at", "created_by", "updated_by", "remarks",
  ],
  tasks: [
    "task_id", "household_id", "category", "task_name", "description",
    "owner_person_id", "due_at", "priority", "status", "recurrence",
    "recurrence_notes", "related_person_id", "related_item_id", "source_type",
    "source_id", "completed_at", "created_at", "updated_at", "created_by",
    "updated_by", "remarks",
  ],
  finance_budgets: [
    "budget_id", "household_id", "month_start", "category", "budget_amount_hkd",
    "owner_person_id", "created_at", "updated_at", "created_by", "updated_by",
    "remarks",
  ],
  asset_snapshots: [
    "asset_snapshot_id", "household_id", "as_of_date", "asset_account_id",
    "asset_value", "liability_amount", "created_at", "updated_at", "created_by",
    "updated_by", "remarks",
  ],
  caregiver_records: [
    "caregiver_record_id", "household_id", "caregiver_id", "record_type",
    "start_at", "end_at", "title", "description", "status", "related_task_id",
    "created_at", "updated_at", "created_by", "updated_by", "remarks",
  ],
  properties: [
    "property_id", "household_id", "visit_date", "estate_name", "district",
    "address_or_block", "flat_type", "saleable_area_sqft", "bedrooms",
    "asking_price_hkd", "transport_score", "family_distance_score",
    "baby_convenience_score", "pros", "cons", "status", "source_url",
    "created_at", "updated_at", "created_by", "updated_by", "remarks",
  ],
  property_scenarios: [
    "scenario_id", "household_id", "property_id", "scenario_name",
    "purchase_price_hkd", "down_payment_pct", "mortgage_term_years",
    "annual_interest_rate", "stress_interest_rate", "estimated_upfront_cost_hkd",
    "current_cash_assets_hkd", "monthly_income_hkd", "monthly_expense_hkd",
    "status", "created_at", "updated_at", "created_by", "updated_by", "remarks",
  ],
  documents: [
    "document_id", "household_id", "document_name", "category", "owner_person_id",
    "storage_location", "issue_date", "expiry_date", "renewal_required",
    "related_task_id", "status", "created_at", "updated_at", "created_by",
    "updated_by", "remarks",
  ],
  task_context_hints: [
    "hint_id", "household_id", "status", "hint_text", "applies_to_category",
    "applies_to_keywords", "applies_to_related_person_id", "applies_to_owner_person_id",
    "applies_to_location_keywords", "priority", "valid_from", "valid_to",
    "created_at", "updated_at", "created_by", "updated_by", "remarks",
  ],
  audit_log: [
    "audit_id", "household_id", "changed_at", "actor_type", "actor_id", "source",
    "sheet_name", "record_id", "operation", "changed_fields_json", "before_json",
    "after_json", "request_text", "result_status", "created_at",
  ],
});

const INVENTORY_CATEGORIES = Object.freeze([
  "baby_consumable", "personal_care", "household_cleaning",
  "medicine", "pet_food", "pet_litter", "groceries", "other",
]);

const INVENTORY_TARGET_GROUPS = Object.freeze([
  "baby", "family", "shared", "mother", "helper", "pet", "other",
]);

const INVENTORY_UNITS = Object.freeze([
  "piece", "pack", "box", "bottle", "can", "cup", "roll", "kg", "g", "ml", "percent",
]);

const TASK_CATEGORIES = Object.freeze(["baby", "finance", "home", "helper", "medical", "property", "pet", "document"]);
const TASK_PRIORITIES = Object.freeze(["low", "medium", "high", "urgent"]);
const TASK_STATUSES = Object.freeze(["open", "in_progress", "waiting", "done", "cancelled"]);
const TASK_RECURRENCES = Object.freeze(["none", "daily", "weekly", "monthly", "quarterly", "yearly", "custom"]);
const CAREGIVER_RECORD_TYPES = Object.freeze(["leave", "schedule", "training", "house_rule", "handover", "reminder", "payment_note"]);
const PROPERTY_STATUSES = Object.freeze(["researched", "to_visit", "visited", "shortlisted", "rejected", "offer_consideration", "archived"]);
const DOCUMENT_CATEGORIES = Object.freeze(["birth_certificate", "identity_document", "marriage_certificate", "lease", "insurance", "helper_contract", "medical", "bank", "tax", "other"]);

function doGet() {
  return json_({
    ok: true,
    service: "family-os-api",
    version: "family_os_api_v3",
    message: "Use POST with an API key.",
  });
}

function doPost(e) {
  try {
    const request = parseRequest_(e);
    assertApiKey_(request.api_key);
    assertSchema_();
    const result = route_(request.action, request.payload || {}, request);
    return json_({ ok: true, action: request.action, result: result });
  } catch (error) {
    return json_({ ok: false, error: String(error.message || error) });
  }
}

function route_(action, payload, request) {
  switch (action) {
    case "health":
      return health_();
    case "get_low_stock_items":
      return getLowStockItems_();
    case "get_inventory_snapshot":
      return getInventorySnapshot_();
    case "get_overdue_tasks":
      return getOverdueTasks_();
    case "get_upcoming_tasks":
      return getUpcomingTasks_(payload);
    case "get_monthly_cashflow":
      return getMonthlyCashflow_(payload);
    case "get_recent_baby_logs":
      return getRecentBabyLogs_(payload);
    case "get_dashboard_snapshot":
      return getDashboardSnapshot_(payload);
    case "get_telegram_allowlist":
      return getTelegramAllowlist_();
    case "query_tasks":
      return queryTasks_(payload);
    case "get_task_context_hints":
      return getTaskContextHints_(payload);
    case "query_finance_transactions":
      return queryFinanceTransactions_(payload);
    case "get_finance_budgets":
      return getFinanceBudgets_(payload);
    case "query_asset_accounts":
      return queryAssetAccounts_(payload);
    case "get_latest_asset_values":
      return getLatestAssetValues_(payload);
    case "query_caregivers":
      return queryCaregivers_(payload);
    case "query_caregiver_records":
      return queryCaregiverRecords_(payload);
    case "query_properties":
      return queryProperties_(payload);
    case "query_property_scenarios":
      return queryPropertyScenarios_(payload);
    case "query_documents":
      return queryDocuments_(payload);
    case "get_expiring_documents":
      return getExpiringDocuments_(payload);
    case "append_baby_log":
      return withWriteLock_(function () {
        return appendBabyLog_(payload, request);
      });
    case "record_inventory_movement":
      return withWriteLock_(function () {
        return recordInventoryMovement_(payload, request);
      });
    case "record_inventory_purchase_batch":
      return withWriteLock_(function () {
        return recordInventoryPurchaseBatch_(payload, request);
      });
    case "record_inventory_consume_batch":
      return withWriteLock_(function () {
        return recordInventoryConsumeBatch_(payload, request);
      });
    case "upsert_inventory_item":
      return withWriteLock_(function () {
        return upsertInventoryItem_(payload, request);
      });
    case "set_inventory_stock_level":
      return withWriteLock_(function () {
        return setInventoryStockLevel_(payload, request);
      });
    case "update_inventory_expiry_date":
      return withWriteLock_(function () {
        return updateInventoryExpiryDate_(payload, request);
      });
    case "merge_inventory_items":
      return withWriteLock_(function () {
        return mergeInventoryItems_(payload, request);
      });
    case "append_finance_transaction":
      return withWriteLock_(function () {
        return appendFinanceTransaction_(payload, request);
      });
    case "append_task":
      return withWriteLock_(function () { return appendTask_(payload, request); });
    case "update_task":
      return withWriteLock_(function () { return updateTask_(payload, request); });
    case "append_finance_budget":
      return withWriteLock_(function () { return appendFinanceBudget_(payload, request); });
    case "update_finance_budget":
      return withWriteLock_(function () { return updateFinanceBudget_(payload, request); });
    case "append_asset_snapshot":
      return withWriteLock_(function () { return appendAssetSnapshot_(payload, request); });
    case "append_caregiver_record":
      return withWriteLock_(function () { return appendCaregiverRecord_(payload, request); });
    case "update_caregiver_record":
      return withWriteLock_(function () { return updateCaregiverRecord_(payload, request); });
    case "append_property":
      return withWriteLock_(function () { return appendProperty_(payload, request); });
    case "update_property":
      return withWriteLock_(function () { return updateProperty_(payload, request); });
    case "append_property_scenario":
      return withWriteLock_(function () { return appendPropertyScenario_(payload, request); });
    case "update_property_scenario":
      return withWriteLock_(function () { return updatePropertyScenario_(payload, request); });
    case "append_document":
      return withWriteLock_(function () { return appendDocument_(payload, request); });
    case "update_document":
      return withWriteLock_(function () { return updateDocument_(payload, request); });
    default:
      throw new Error("Unsupported action: " + action);
  }
}

function health_() {
  return {
    service: "family-os-api",
    version: "family_os_api_v3",
    household_id: FAMILY_OS.householdId,
    schema_version: FAMILY_OS.schemaVersion,
    timestamp: now_(),
  };
}

function getLowStockItems_() {
  return getInventorySnapshot_().filter(function (item) {
    return item.needs_restock === true;
  });
}

function getInventorySnapshot_() {
  return rowsAsObjects_("inventory_items").filter(function (row) {
    return row.item_id && String(row.status || "active") === "active";
  }).map(function (row) {
    const item = pick_(row, [
      "item_id", "item_name", "canonical_item_name", "category", "target_group",
      "brand_name", "preferred_brand", "unit", "safety_stock", "quantity_on_hand",
      "next_expiry_date", "is_low_stock", "is_expiring_soon", "needs_restock",
    ]);
    item.next_expiry_date = formatDateValue_(item.next_expiry_date);
    return item;
  });
}

function getOverdueTasks_() {
  return rowsAsObjects_("tasks").filter(function (row) {
    return row.task_id && asBoolean_(row.is_overdue);
  }).map(compactTask_);
}

function getUpcomingTasks_(payload) {
  const days = clampNumber_(payload.days || 7, 1, 90);
  const now = new Date();
  const until = new Date(now.getTime() + days * 86400000);
  return rowsAsObjects_("tasks").filter(function (row) {
    if (!row.task_id || ["done", "cancelled"].indexOf(String(row.status)) !== -1) return false;
    const due = parseDate_(row.due_at);
    return due && due >= now && due <= until;
  }).map(compactTask_);
}

function getMonthlyCashflow_(payload) {
  const month = requireMonth_(payload.month || Utilities.formatDate(new Date(), FAMILY_OS.timezone, "yyyy-MM"));
  const totals = { month: month, income_hkd: 0, expense_hkd: 0, savings_hkd: 0, expense_by_category: {} };
  rowsAsObjects_("finance_transactions").forEach(function (row) {
    if (!row.transaction_id || row.status !== "posted") return;
    if (monthOf_(row.transaction_date) !== month) return;
    const amount = Number(row.amount_hkd || 0);
    if (row.type === "income") totals.income_hkd += amount;
    if (row.type === "expense") {
      totals.expense_hkd += amount;
      const category = String(row.category || "other");
      totals.expense_by_category[category] = (totals.expense_by_category[category] || 0) + amount;
    }
  });
  totals.savings_hkd = totals.income_hkd - totals.expense_hkd;
  return totals;
}

function getRecentBabyLogs_(payload) {
  const limit = clampNumber_(payload.limit || 20, 1, 100);
  const type = payload.log_type ? String(payload.log_type) : "";
  return rowsAsObjects_("baby_log").filter(function (row) {
    return row.baby_log_id && (!type || row.log_type === type);
  }).slice(-limit).reverse().map(function (row) {
    return pick_(row, [
      "baby_log_id", "event_at", "log_type", "log_subtype", "description",
      "value_number", "value_text", "unit", "started_at", "ended_at",
      "duration_minutes", "remarks",
    ]);
  });
}

function getDashboardSnapshot_(payload) {
  return {
    timestamp: now_(),
    cashflow: getMonthlyCashflow_(payload || {}),
    low_stock_items: getLowStockItems_(),
    overdue_tasks: getOverdueTasks_(),
    upcoming_tasks: getUpcomingTasks_({ days: (payload && payload.days) || 7 }),
  };
}

function getTelegramAllowlist_() {
  const people = rowsAsObjects_("people").filter(function (row) {
    return row.person_id
      && String(row.status || "active") === "active"
      && String(row.telegram_user_id || "").trim();
  }).map(function (row) {
    return {
      person_id: String(row.person_id || ""),
      display_name: String(row.display_name || ""),
      role: String(row.role || ""),
      telegram_user_id: String(row.telegram_user_id || "").trim(),
    };
  });
  const allowedUserIds = [];
  const seen = {};
  people.forEach(function (person) {
    if (!seen[person.telegram_user_id]) {
      seen[person.telegram_user_id] = true;
      allowedUserIds.push(person.telegram_user_id);
    }
  });
  return {
    allowed_user_ids: allowedUserIds,
    people: people,
  };
}

function queryTasks_(payload) {
  return queryRows_("tasks", "task_id", payload, {
    filters: ["category", "status", "owner_person_id", "related_person_id", "related_item_id"],
    dateField: "due_at",
    fields: ["task_id", "category", "task_name", "description", "owner_person_id", "due_at", "priority", "status", "recurrence", "related_person_id", "related_item_id", "completed_at", "remarks"],
  });
}

function getTaskContextHints_(payload) {
  return queryRows_("task_context_hints", "hint_id", payload, {
    filters: ["status", "applies_to_category", "applies_to_related_person_id", "applies_to_owner_person_id"],
    fields: [
      "hint_id", "status", "hint_text", "applies_to_category", "applies_to_keywords",
      "applies_to_related_person_id", "applies_to_owner_person_id", "applies_to_location_keywords",
      "priority", "valid_from", "valid_to", "remarks",
    ],
  });
}

function queryFinanceTransactions_(payload) {
  const safe = copyObject_(payload);
  assertAllowedKeys_(safe, ["limit", "month", "type", "category", "payer_person_id"], "query_finance_transactions");
  const month = safe.month ? requireMonth_(safe.month) : "";
  const rows = rowsWithId_("finance_transactions", "transaction_id").reverse().filter(function (row) {
    if (month && monthOf_(row.transaction_date) !== month) return false;
    return exactFiltersMatch_(row, safe, ["type", "category", "payer_person_id"]);
  });
  return limitRows_(rows, safe.limit).map(function (row) {
    return compactRow_(row, ["transaction_id", "transaction_date", "type", "category", "sub_category", "item_name", "amount", "currency", "amount_hkd", "payer_person_id", "payment_method", "status", "remarks"]);
  });
}

function getFinanceBudgets_(payload) {
  return queryRows_("finance_budgets", "budget_id", payload, {
    filters: ["month_start", "category", "owner_person_id"],
    fields: ["budget_id", "month_start", "category", "budget_amount_hkd", "owner_person_id", "remarks"],
  });
}

function queryAssetAccounts_(payload) {
  return queryRows_("asset_accounts", "asset_account_id", payload, {
    filters: ["owner_person_id", "asset_type", "liquidity_class", "include_in_cash_assets", "status"],
    fields: ["asset_account_id", "owner_person_id", "asset_type", "institution", "account_name", "currency", "liquidity_class", "include_in_cash_assets", "status", "remarks"],
  });
}

function getLatestAssetValues_(payload) {
  const safe = copyObject_(payload);
  assertAllowedKeys_(safe, ["limit", "owner_person_id", "asset_account_id"], "get_latest_asset_values");
  const rows = rowsWithId_("asset_snapshots", "asset_snapshot_id").reverse().filter(function (row) {
    if (!asBoolean_(row.is_latest)) return false;
    return exactFiltersMatch_(row, safe, ["asset_account_id"]);
  }).filter(function (row) {
    if (!safe.owner_person_id) return true;
    const account = findRecord_("asset_accounts", "asset_account_id", row.asset_account_id);
    return account && String(account.owner_person_id) === String(safe.owner_person_id);
  });
  return limitRows_(rows, safe.limit).map(function (row) {
    return compactRow_(row, ["asset_snapshot_id", "as_of_date", "asset_account_id", "asset_value", "liability_amount", "net_value", "cash_asset_value_hkd", "is_latest", "remarks"]);
  });
}

function queryCaregivers_(payload) {
  return queryRows_("caregivers", "caregiver_id", payload, {
    filters: ["caregiver_type", "person_id"],
    dateField: "contract_expiry_date",
    fields: ["caregiver_id", "person_id", "caregiver_type", "start_date", "end_date", "contract_expiry_date", "monthly_cost_hkd", "off_day", "work_scope", "important_notes", "days_to_contract_end", "remarks"],
  });
}

function queryCaregiverRecords_(payload) {
  return queryRows_("caregiver_records", "caregiver_record_id", payload, {
    filters: ["caregiver_id", "record_type", "status"],
    dateField: "start_at",
    fields: ["caregiver_record_id", "caregiver_id", "record_type", "start_at", "end_at", "title", "description", "status", "related_task_id", "remarks"],
  });
}

function queryProperties_(payload) {
  return queryRows_("properties", "property_id", payload, {
    filters: ["district", "status"],
    dateField: "visit_date",
    fields: ["property_id", "visit_date", "estate_name", "district", "address_or_block", "flat_type", "saleable_area_sqft", "bedrooms", "asking_price_hkd", "price_per_sqft", "transport_score", "family_distance_score", "baby_convenience_score", "pros", "cons", "status", "source_url", "remarks"],
  });
}

function queryPropertyScenarios_(payload) {
  return queryRows_("property_scenarios", "scenario_id", payload, {
    filters: ["property_id", "status"],
    fields: ["scenario_id", "property_id", "scenario_name", "purchase_price_hkd", "down_payment_pct", "down_payment_hkd", "mortgage_amount_hkd", "mortgage_term_years", "annual_interest_rate", "stress_interest_rate", "monthly_payment_hkd", "stress_monthly_payment_hkd", "estimated_upfront_cost_hkd", "total_upfront_cash_hkd", "current_cash_assets_hkd", "remaining_cash_after_purchase_hkd", "monthly_income_hkd", "monthly_expense_hkd", "monthly_buffer_after_mortgage_hkd", "payment_to_income_pct", "status", "remarks"],
  });
}

function queryDocuments_(payload) {
  return queryRows_("documents", "document_id", payload, {
    filters: ["category", "owner_person_id", "status", "renewal_required"],
    dateField: "expiry_date",
    fields: ["document_id", "document_name", "category", "owner_person_id", "storage_location", "issue_date", "expiry_date", "renewal_required", "related_task_id", "status", "days_to_expiry", "is_expiring_soon", "remarks"],
  });
}

function getExpiringDocuments_(payload) {
  const safe = copyObject_(payload);
  assertAllowedKeys_(safe, ["limit", "category", "owner_person_id"], "get_expiring_documents");
  const rows = rowsWithId_("documents", "document_id").reverse().filter(function (row) {
    return asBoolean_(row.is_expiring_soon) && exactFiltersMatch_(row, safe, ["category", "owner_person_id"]);
  });
  return limitRows_(rows, safe.limit).map(function (row) {
    return compactRow_(row, ["document_id", "document_name", "category", "owner_person_id", "expiry_date", "days_to_expiry", "renewal_required", "status", "remarks"]);
  });
}

function appendBabyLog_(payload, request) {
  const now = now_();
  const record = {
    baby_log_id: makeId_("baby"),
    household_id: FAMILY_OS.householdId,
    event_at: timestamp_(payload.event_at || now),
    baby_person_id: payload.baby_person_id || "per_baby",
    log_type: requireString_(payload.log_type, "log_type"),
    log_subtype: payload.log_subtype || "",
    description: payload.description || "",
    value_number: optionalNumber_(payload.value_number),
    value_text: payload.value_text || "",
    unit: payload.unit || "",
    started_at: payload.started_at ? timestamp_(payload.started_at) : "",
    ended_at: payload.ended_at ? timestamp_(payload.ended_at) : "",
    related_task_id: payload.related_task_id || "",
    recorded_by_person_id: payload.recorded_by_person_id || "",
    status: "active",
    created_at: now,
    updated_at: now,
    created_by: "apps_script",
    updated_by: "apps_script",
    remarks: payload.remarks || "Recorded through Family OS API",
  };
  normalizeBabyLog_(record);
  appendRecord_("baby_log", record);
  appendAudit_("baby_log", record.baby_log_id, "append", {}, record, request);
  return pick_(record, [
    "baby_log_id", "event_at", "log_type", "log_subtype", "description",
    "value_number", "value_text", "unit", "remarks",
  ]);
}

function normalizeBabyLog_(record) {
  if (record.log_type === "feeding" && record.value_number !== "" && String(record.unit).toLowerCase() === "ml") {
    record.log_subtype = record.log_subtype || "milk";
    record.description = "BB 飲奶 " + record.value_number + " ml";
    record.value_text = "";
    record.unit = "ml";
    record.remarks = record.remarks || "Recorded through Family OS API";
  }
}

function recordInventoryMovement_(payload, request) {
  const now = now_();
  const type = requireOneOf_(payload.movement_type, [
    "purchase", "consume", "adjustment_in", "adjustment_out", "discard", "return",
  ], "movement_type");
  const delta = requireNumber_(payload.quantity_delta, "quantity_delta");
  if (["purchase", "adjustment_in", "return"].indexOf(type) !== -1 && delta <= 0) {
    throw new Error("Inbound inventory movement requires a positive quantity_delta.");
  }
  if (["consume", "adjustment_out", "discard"].indexOf(type) !== -1 && delta >= 0) {
    throw new Error("Outbound inventory movement requires a negative quantity_delta.");
  }
  const itemId = requireString_(payload.item_id, "item_id");
  assertRecordExists_("inventory_items", "item_id", itemId);
  const itemMaster = rowsAsObjects_("inventory_items").find(function (row) {
    return row.item_id === itemId;
  }) || null;
  const resolvedExpiry = resolveInventoryExpiryDate_({
    item_id: itemId,
    item_name: itemMaster ? itemMaster.item_name : "",
    category: itemMaster ? itemMaster.category : "",
    unit: itemMaster ? itemMaster.unit : "",
    expiry_date: payload.expiry_date || "",
  }, payload.event_at || now, type);
  const record = {
    movement_id: makeId_("mov"),
    household_id: FAMILY_OS.householdId,
    event_at: timestamp_(payload.event_at || now),
    item_id: itemId,
    movement_type: type,
    quantity_delta: delta,
    expiry_date: resolvedExpiry.expiry_date,
    unit_cost_hkd: optionalNumber_(payload.unit_cost_hkd),
    related_transaction_id: payload.related_transaction_id || "",
    status: "posted",
    created_at: now,
    updated_at: now,
    created_by: "apps_script",
    updated_by: "apps_script",
    remarks: payload.remarks || "Recorded through Family OS API",
  };
  appendRecord_("inventory_movements", record);
  appendAudit_("inventory_movements", record.movement_id, "append", {}, record, request);
  record.expiry_date_is_default = resolvedExpiry.is_default;
  return record;
}

function recordInventoryPurchaseBatch_(payload, request) {
  const items = payload.items;
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("items must be a non-empty array.");
  }
  if (items.length > 50) throw new Error("A purchase batch may contain at most 50 items.");

  const eventAt = timestamp_(payload.event_at || now_());
  const itemRows = rowsAsObjects_("inventory_items").filter(hasId_("item_id"));
  const seen = {};
  const results = items.map(function (rawItem, index) {
    const item = rawItem || {};
    const itemName = requireString_(item.item_name, "items[" + index + "].item_name");
    const itemKey = requireSlug_(item.item_key, "items[" + index + "].item_key");
    const category = requireOneOf_(item.category, INVENTORY_CATEGORIES, "items[" + index + "].category");
    const unit = normalizeInventoryUnit_(item.unit, "items[" + index + "].unit");
    const quantity = positiveNumber_(item.quantity, "items[" + index + "].quantity");
    const resolvedExpiry = resolveInventoryExpiryDate_({
      item_key: itemKey,
      item_id: item.item_id || "",
      item_name: itemName,
      category: category,
      unit: unit,
      expiry_date: item.expiry_date || "",
    }, eventAt, "purchase");
    const expiryDate = resolvedExpiry.expiry_date;
    const lookupKey = normalizeName_(itemName);
    if (seen[lookupKey]) throw new Error("Duplicate item in batch: " + itemName);
    seen[lookupKey] = true;

    let master = findInventoryItemForPurchase_(itemRows, itemName, item.item_id, unit);
    let created = false;
    if (!master) {
      const itemId = uniqueInventoryItemId_(itemRows, "itm_" + itemKey);
      master = createInventoryItem_({
        item_id: itemId,
        item_name: itemName,
        category: category,
        unit: unit,
        safety_stock: optionalNonNegativeNumber_(item.safety_stock, "items[" + index + "].safety_stock"),
        storage_location: item.storage_location || "",
        next_expiry_date: expiryDate,
        preferred_brand: item.preferred_brand || "",
        purchase_channel: item.purchase_channel || "",
        remarks: item.remarks || "Created through Family OS API purchase batch",
      }, itemRows, request);
      itemRows.push(master);
      created = true;
    } else {
      if (String(master.unit) !== unit) {
        throw new Error("Unit mismatch for " + itemName + ": existing=" + master.unit + ", requested=" + unit);
      }
      if (String(master.category) !== category) {
        throw new Error("Category mismatch for " + itemName + ": existing=" + master.category + ", requested=" + category);
      }
    }

    const movement = recordInventoryMovement_({
      event_at: eventAt,
      item_id: master.item_id,
      movement_type: "purchase",
      quantity_delta: quantity,
      expiry_date: expiryDate,
      unit_cost_hkd: item.unit_cost_hkd,
      related_transaction_id: item.related_transaction_id,
      remarks: item.remarks || "Purchase batch: " + itemName,
    }, request);

    return {
      item_id: master.item_id,
      item_name: master.item_name,
      category: master.category,
      unit: master.unit,
      quantity_added: quantity,
      expiry_date: expiryDate,
      expiry_date_is_default: resolvedExpiry.is_default,
      created_item: created,
      movement_id: movement.movement_id,
    };
  });

  return { item_count: results.length, items: results };
}

function recordInventoryConsumeBatch_(payload, request) {
  const items = payload.items;
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("items must be a non-empty array.");
  }
  if (items.length > 50) throw new Error("A consumption batch may contain at most 50 items.");

  const eventAt = timestamp_(payload.event_at || now_());
  const itemRows = rowsAsObjects_("inventory_items").filter(hasId_("item_id"));
  const seen = {};
  const results = items.map(function (rawItem, index) {
    const item = rawItem || {};
    const itemName = requireString_(item.item_name, "items[" + index + "].item_name");
    const unit = normalizeInventoryUnit_(item.unit, "items[" + index + "].unit");
    const quantity = positiveNumber_(item.quantity, "items[" + index + "].quantity");
    const lookupKey = normalizeName_(itemName);
    if (seen[lookupKey]) throw new Error("Duplicate item in batch: " + itemName);
    seen[lookupKey] = true;

    const master = findInventoryItem_(itemRows, itemName, item.item_id);
    if (!master) throw new Error("Unknown inventory item: " + itemName);
    if (String(master.unit) !== unit) {
      throw new Error("Unit mismatch for " + itemName + ": existing=" + master.unit + ", requested=" + unit);
    }

    const movement = recordInventoryMovement_({
      event_at: eventAt,
      item_id: master.item_id,
      movement_type: "consume",
      quantity_delta: -quantity,
      remarks: item.remarks || "Consumption batch: " + itemName,
    }, request);

    return {
      item_id: master.item_id,
      item_name: master.item_name,
      unit: master.unit,
      quantity_consumed: quantity,
      movement_id: movement.movement_id,
    };
  });

  return { item_count: results.length, items: results };
}

function upsertInventoryItem_(payload, request) {
  assertAllowedKeys_(payload, [
    "item_id", "item_key", "item_name", "canonical_item_name", "category", "target_group",
    "brand_name", "unit", "safety_stock", "storage_location", "preferred_brand",
    "purchase_channel", "status", "remarks",
  ], "upsert_inventory_item");

  const itemRows = rowsAsObjects_("inventory_items").filter(hasId_("item_id"));
  const itemName = requireString_(payload.item_name, "item_name");
  const existingByName = findInventoryItem_(itemRows, itemName, "");
  const itemId = payload.item_id || (existingByName ? existingByName.item_id : ("itm_" + requireSlug_(payload.item_key, "item_key")));
  const existing = itemRows.find(function (row) {
    return String(row.item_id) === String(itemId);
  }) || existingByName;
  const patch = normalizeInventoryItemPatch_({
    item_name: itemName,
    canonical_item_name: payload.canonical_item_name || itemName,
    category: payload.category,
    target_group: payload.target_group || inferInventoryTargetGroup_(payload),
    brand_name: payload.brand_name,
    unit: payload.unit,
    safety_stock: payload.safety_stock,
    storage_location: payload.storage_location,
    preferred_brand: payload.preferred_brand,
    purchase_channel: payload.purchase_channel,
    status: payload.status,
    remarks: payload.remarks,
  });

  if (!existing) {
    const created = createInventoryItem_(Object.assign({
      item_id: itemId,
    }, patch), itemRows, request);
    return Object.assign({ operation: "created" }, compactRow_(created, WRITE_COLUMNS.inventory_items));
  }

  const updatePatch = {};
  Object.keys(patch).forEach(function (key) {
    if (patch[key] !== undefined && patch[key] !== null && patch[key] !== "") updatePatch[key] = patch[key];
  });
  if (Object.keys(updatePatch).length === 0) {
    return Object.assign({ operation: "unchanged" }, compactRow_(existing, WRITE_COLUMNS.inventory_items));
  }

  const updated = updateBusinessRecord_("inventory_items", "item_id", existing.item_id, updatePatch, [
    "item_name", "canonical_item_name", "category", "target_group", "brand_name",
    "unit", "safety_stock", "storage_location", "preferred_brand", "purchase_channel",
    "status", "remarks",
  ], normalizeInventoryItemPatch_, assertInventoryItemPatch_, request);
  return Object.assign({ operation: "updated" }, updated);
}

function setInventoryStockLevel_(payload, request) {
  assertAllowedKeys_(payload, [
    "item_id", "item_name", "unit", "quantity_on_hand", "target_quantity",
    "event_at", "remarks",
  ], "set_inventory_stock_level");

  const itemRows = rowsAsObjects_("inventory_items").filter(hasId_("item_id"));
  const itemName = payload.item_name || "";
  const master = findInventoryItem_(itemRows, itemName, payload.item_id);
  if (!master) throw new Error("Unknown inventory item: " + (itemName || payload.item_id || ""));

  const unit = normalizeInventoryUnit_(payload.unit || master.unit, "unit");
  if (String(master.unit) !== unit) {
    throw new Error("Unit mismatch for " + master.item_name + ": existing=" + master.unit + ", requested=" + unit);
  }

  const target = nonNegativeNumber_(
    payload.quantity_on_hand !== undefined ? payload.quantity_on_hand : payload.target_quantity,
    "quantity_on_hand",
  );
  if (unit === "percent" && target > 100) {
    throw new Error("quantity_on_hand must be between 0 and 100 for percent-tracked inventory.");
  }

  const current = optionalNumber_(master.quantity_on_hand);
  const currentNumber = current === "" ? 0 : Number(current);
  const delta = target - currentNumber;
  if (delta === 0) {
    return {
      item_id: master.item_id,
      item_name: master.item_name,
      unit: unit,
      previous_quantity_on_hand: currentNumber,
      quantity_on_hand: target,
      movement_id: "",
      operation: "unchanged",
    };
  }

  const movementType = delta > 0 ? "adjustment_in" : "adjustment_out";
  const movement = recordInventoryMovement_({
    event_at: payload.event_at || now_(),
    item_id: master.item_id,
    movement_type: movementType,
    quantity_delta: delta,
    remarks: payload.remarks || "Set inventory stock level through Family OS API",
  }, request);

  return {
    item_id: master.item_id,
    item_name: master.item_name,
    unit: unit,
    previous_quantity_on_hand: currentNumber,
    quantity_on_hand: target,
    quantity_delta: delta,
    movement_type: movementType,
    movement_id: movement.movement_id,
    operation: "adjusted",
  };
}

function updateInventoryExpiryDate_(payload, request) {
  assertAllowedKeys_(payload, [
    "item_id", "item_name", "next_expiry_date", "remarks",
  ], "update_inventory_expiry_date");

  const itemRows = rowsAsObjects_("inventory_items").filter(hasId_("item_id"));
  const itemName = payload.item_name || "";
  const master = findInventoryItem_(itemRows, itemName, payload.item_id);
  if (!master) throw new Error("Unknown inventory item: " + (itemName || payload.item_id || ""));

  const nextExpiryDate = requireDate_(payload.next_expiry_date);
  const previousNextExpiryDate = formatDateValue_(master.next_expiry_date);
  const remarks = payload.remarks || "Updated inventory expiry date through Family OS API";

  if (previousNextExpiryDate === nextExpiryDate && !payload.remarks) {
    return {
      item_id: master.item_id,
      item_name: master.item_name,
      previous_next_expiry_date: previousNextExpiryDate,
      next_expiry_date: nextExpiryDate,
      operation: "unchanged",
    };
  }

  const updated = updateBusinessRecord_("inventory_items", "item_id", master.item_id, {
    next_expiry_date: nextExpiryDate,
    remarks: remarks,
  }, [
    "next_expiry_date", "remarks",
  ], normalizeInventoryItemPatch_, assertInventoryItemPatch_, request);

  return {
    item_id: updated.item_id,
    item_name: updated.item_name,
    previous_next_expiry_date: previousNextExpiryDate,
    next_expiry_date: updated.next_expiry_date,
    operation: previousNextExpiryDate === nextExpiryDate ? "unchanged" : "updated",
    remarks: updated.remarks,
  };
}

function mergeInventoryItems_(payload, request) {
  assertAllowedKeys_(payload, [
    "keep_item_id", "keep_item_name",
    "merge_item_id", "merge_item_name",
    "merged_item_name", "remarks",
  ], "merge_inventory_items");

  const itemRows = rowsAsObjects_("inventory_items").filter(hasId_("item_id"));
  const keepMaster = findInventoryItem_(itemRows, payload.keep_item_name || payload.merged_item_name || "", payload.keep_item_id || "");
  const mergeMaster = findInventoryItem_(itemRows, payload.merge_item_name || "", payload.merge_item_id || "");

  if (!keepMaster) throw new Error("Unknown keep inventory item.");
  if (!mergeMaster) throw new Error("Unknown merge inventory item.");
  if (String(keepMaster.item_id) === String(mergeMaster.item_id)) {
    throw new Error("Cannot merge the same inventory item into itself.");
  }
  if (String(keepMaster.status || "active") !== "active") {
    throw new Error("The kept inventory item must be active.");
  }
  if (String(mergeMaster.status || "active") !== "active") {
    throw new Error("The merged inventory item must be active.");
  }

  const keepUnit = normalizeInventoryUnit_(keepMaster.unit, "unit");
  const mergeUnit = normalizeInventoryUnit_(mergeMaster.unit, "unit");
  if (keepUnit !== mergeUnit) {
    throw new Error("Unit mismatch for merge: " + keepMaster.item_name + "=" + keepUnit + ", " + mergeMaster.item_name + "=" + mergeUnit);
  }

  const keepQuantity = optionalNumber_(keepMaster.quantity_on_hand);
  const mergeQuantity = optionalNumber_(mergeMaster.quantity_on_hand);
  const keepNumber = keepQuantity === "" ? 0 : Number(keepQuantity);
  const mergeNumber = mergeQuantity === "" ? 0 : Number(mergeQuantity);
  const finalQuantity = keepNumber + mergeNumber;
  const canonicalName = payload.merged_item_name ? requireString_(payload.merged_item_name, "merged_item_name") : keepMaster.item_name;
  const remarks = payload.remarks || ("Merged inventory item " + mergeMaster.item_name + " into " + canonicalName);

  if (canonicalName !== keepMaster.item_name || remarks) {
    updateBusinessRecord_("inventory_items", "item_id", keepMaster.item_id, {
      item_name: canonicalName,
      canonical_item_name: payload.merged_item_name || keepMaster.canonical_item_name || canonicalName,
      remarks: remarks,
    }, [
      "item_name", "canonical_item_name", "category", "target_group", "brand_name",
      "unit", "safety_stock", "storage_location", "preferred_brand", "purchase_channel",
      "status", "remarks",
    ], normalizeInventoryItemPatch_, assertInventoryItemPatch_, request);
  }

  const keepStockResult = setInventoryStockLevel_({
    item_id: keepMaster.item_id,
    unit: keepUnit,
    quantity_on_hand: finalQuantity,
    remarks: remarks,
  }, request);

  const mergeStockResult = setInventoryStockLevel_({
    item_id: mergeMaster.item_id,
    unit: mergeUnit,
    quantity_on_hand: 0,
    remarks: remarks,
  }, request);

  updateBusinessRecord_("inventory_items", "item_id", mergeMaster.item_id, {
    status: "inactive",
    remarks: remarks,
  }, [
    "item_name", "canonical_item_name", "category", "target_group", "brand_name",
    "unit", "safety_stock", "storage_location", "preferred_brand", "purchase_channel",
    "status", "remarks",
  ], normalizeInventoryItemPatch_, assertInventoryItemPatch_, request);

  return {
    kept_item_id: keepMaster.item_id,
    kept_item_name: canonicalName,
    merged_item_id: mergeMaster.item_id,
    merged_item_name: mergeMaster.item_name,
    unit: keepUnit,
    kept_previous_quantity_on_hand: keepNumber,
    merged_previous_quantity_on_hand: mergeNumber,
    final_quantity_on_hand: finalQuantity,
    hidden_item_status: "inactive",
    keep_movement_id: keepStockResult.movement_id || "",
    merge_movement_id: mergeStockResult.movement_id || "",
  };
}

function createInventoryItem_(payload, itemRows, request) {
  const now = now_();
  const itemId = requireString_(payload.item_id, "item_id");
  if (itemRows.some(function (row) { return row.item_id === itemId; })) {
    throw new Error("item_id already exists: " + itemId);
  }
  const record = {
    item_id: itemId,
    household_id: FAMILY_OS.householdId,
    item_name: requireString_(payload.item_name, "item_name"),
    canonical_item_name: payload.canonical_item_name || payload.item_name,
    category: requireOneOf_(payload.category, INVENTORY_CATEGORIES, "category"),
    target_group: normalizeInventoryTargetGroup_(payload.target_group || inferInventoryTargetGroup_(payload)),
    brand_name: payload.brand_name || "",
    unit: normalizeInventoryUnit_(payload.unit, "unit"),
    safety_stock: payload.safety_stock,
    storage_location: payload.storage_location || "",
    next_expiry_date: payload.next_expiry_date || "",
    preferred_brand: payload.preferred_brand || "",
    purchase_channel: payload.purchase_channel || "",
    status: "active",
    created_at: now,
    updated_at: now,
    created_by: "apps_script",
    updated_by: "apps_script",
    remarks: payload.remarks || "Created through Family OS API",
  };
  appendRecord_("inventory_items", record);
  appendAudit_("inventory_items", record.item_id, "append", {}, record, request);
  return record;
}

function resolveInventoryExpiryDate_(item, eventAt, movementType) {
  const explicit = item && item.expiry_date ? requireDate_(item.expiry_date) : "";
  if (explicit) {
    return { expiry_date: explicit, is_default: false };
  }

  if (["purchase", "adjustment_in", "return"].indexOf(String(movementType || "")) === -1) {
    return { expiry_date: "", is_default: false };
  }

  const inferredDays = inferInventoryExpiryDays_(item || {});
  if (!inferredDays) {
    return { expiry_date: "", is_default: false };
  }

  return {
    expiry_date: addDaysToDateText_(eventAt || now_(), inferredDays),
    is_default: true,
  };
}

function inferInventoryExpiryDays_(item) {
  const key = [
    item.item_key || "",
    item.item_id || "",
    item.item_name || "",
    item.category || "",
    item.unit || "",
  ].join(" ").toLowerCase();

  if (!key.trim()) return 0;

  if (/(formula|milk powder|formula_milk|baby_feeding|baby_consumable)/.test(key)) return 730;
  if (/(medicine|medication|supplement|vitamin)/.test(key)) return 365;
  if (/(ice cream|icecream|gelato|frozen dessert)/.test(key)) return 180;
  if (/(instant noodle|instant_noodle|ramen|noodle|pasta)/.test(key)) return 180;
  if (/(canned|can | can$|tin|pet_food_wet|wet food)/.test(key)) return 720;
  if (/(oil|cooking oil|olive oil|sesame oil)/.test(key)) return 365;
  if (/(rice|flour|cereal|oat|granola|biscuit|cracker|snack|bread)/.test(key)) return 180;
  if (/(salt|sugar|vinegar)/.test(key)) return 1095;
  if (/(soy sauce|oyster sauce|sauce|condiment)/.test(key)) return 365;
  if (/(pet_food|dry food|kibble)/.test(key)) return 365;
  if (/(cleaning|detergent|disinfectant|bleach|soap|shampoo|body wash|wipes|personal_care)/.test(key)) return 730;

  return 0;
}

function addDaysToDateText_(value, days) {
  const base = parseDate_(String(value).slice(0, 10) + "T00:00:00+08:00");
  if (!base) throw new Error("Invalid base date for default inventory expiry.");
  const shifted = new Date(base.getTime() + days * 86400000);
  return Utilities.formatDate(shifted, FAMILY_OS.timezone, "yyyy-MM-dd");
}

function findInventoryItem_(rows, itemName, itemId) {
  if (itemId) {
    const byId = rows.find(function (row) { return row.item_id === String(itemId); });
    if (!byId) throw new Error("Unknown item_id: " + itemId);
    return byId;
  }
  const normalized = normalizeName_(itemName);
  return rows.find(function (row) {
    return normalizeName_(row.item_name) === normalized;
  }) || null;
}

function findInventoryItemForPurchase_(rows, itemName, itemId, unit) {
  if (itemId) return findInventoryItem_(rows, itemName, itemId);
  const normalized = normalizeName_(itemName);
  const normalizedUnit = normalizeInventoryUnit_(unit, "unit");
  return rows.find(function (row) {
    return normalizeName_(row.item_name) === normalized && String(row.unit) === normalizedUnit;
  }) || null;
}

function uniqueInventoryItemId_(rows, baseItemId) {
  const base = requireString_(baseItemId, "item_id");
  let candidate = base;
  let suffix = 2;
  while (rows.some(function (row) { return String(row.item_id) === candidate; })) {
    candidate = base + "_" + suffix;
    suffix += 1;
  }
  return candidate;
}

function appendFinanceTransaction_(payload, request) {
  const now = now_();
  const record = {
    transaction_id: makeId_("txn"),
    household_id: FAMILY_OS.householdId,
    transaction_date: requireDate_(payload.transaction_date || now.slice(0, 10)),
    type: requireOneOf_(payload.type, ["income", "expense", "transfer"], "type"),
    category: requireString_(payload.category, "category"),
    sub_category: payload.sub_category || "",
    item_name: payload.item_name || "",
    amount: positiveNumber_(payload.amount, "amount"),
    currency: payload.currency || "HKD",
    fx_rate_to_hkd: positiveNumber_(payload.fx_rate_to_hkd || 1, "fx_rate_to_hkd"),
    payer_person_id: payload.payer_person_id || "",
    is_recurring: payload.is_recurring === true,
    payment_method: payload.payment_method || "other",
    related_property_id: payload.related_property_id || "",
    status: "posted",
    created_at: now,
    updated_at: now,
    created_by: "apps_script",
    updated_by: "apps_script",
    remarks: payload.remarks || "Recorded through Family OS API",
  };
  appendRecord_("finance_transactions", record);
  appendAudit_("finance_transactions", record.transaction_id, "append", {}, record, request);
  return record;
}

function appendTask_(payload, request) {
  assertAllowedKeys_(payload, ["category", "task_name", "description", "owner_person_id", "due_at", "priority", "status", "recurrence", "recurrence_notes", "related_person_id", "related_item_id", "source_type", "source_id", "completed_at", "remarks"], "append_task");
  const now = now_();
  const record = normalizeTaskPatch_(payload);
  record.task_id = makeId_("tsk");
  record.household_id = FAMILY_OS.householdId;
  record.category = requireOneOf_(record.category, TASK_CATEGORIES, "category");
  record.task_name = requireString_(record.task_name, "task_name");
  record.priority = record.priority || "medium";
  record.status = record.status || "open";
  record.recurrence = record.recurrence || "none";
  assertTaskReferences_(record);
  addCreateMetadata_(record, now);
  appendRecord_("tasks", record);
  appendAudit_("tasks", record.task_id, "append", {}, record, request);
  return compactRow_(record, WRITE_COLUMNS.tasks);
}

function updateTask_(payload, request) {
  assertAllowedKeys_(payload, ["task_id", "patch"], "update_task");
  return updateBusinessRecord_("tasks", "task_id", payload.task_id, payload.patch, [
    "category", "task_name", "description", "owner_person_id", "due_at", "priority",
    "status", "recurrence", "recurrence_notes", "related_person_id", "related_item_id",
    "source_type", "source_id", "completed_at", "remarks",
  ], normalizeTaskPatch_, assertTaskReferences_, request);
}

function appendFinanceBudget_(payload, request) {
  assertAllowedKeys_(payload, ["month_start", "category", "budget_amount_hkd", "owner_person_id", "remarks"], "append_finance_budget");
  const now = now_();
  const record = normalizeFinanceBudgetPatch_(payload);
  record.budget_id = makeId_("bdg");
  record.household_id = FAMILY_OS.householdId;
  record.month_start = requireMonthStart_(record.month_start);
  record.category = requireString_(record.category, "category");
  record.budget_amount_hkd = nonNegativeNumber_(record.budget_amount_hkd, "budget_amount_hkd");
  assertOptionalRecordExists_("people", "person_id", record.owner_person_id);
  addCreateMetadata_(record, now);
  appendRecord_("finance_budgets", record);
  appendAudit_("finance_budgets", record.budget_id, "append", {}, record, request);
  return compactRow_(record, WRITE_COLUMNS.finance_budgets);
}

function updateFinanceBudget_(payload, request) {
  assertAllowedKeys_(payload, ["budget_id", "patch"], "update_finance_budget");
  return updateBusinessRecord_("finance_budgets", "budget_id", payload.budget_id, payload.patch, [
    "month_start", "category", "budget_amount_hkd", "owner_person_id", "remarks",
  ], normalizeFinanceBudgetPatch_, function (record) {
    assertOptionalRecordExists_("people", "person_id", record.owner_person_id);
  }, request);
}

function appendAssetSnapshot_(payload, request) {
  assertAllowedKeys_(payload, ["as_of_date", "asset_account_id", "asset_value", "liability_amount", "remarks"], "append_asset_snapshot");
  const now = now_();
  const record = {
    asset_snapshot_id: makeId_("ast"),
    household_id: FAMILY_OS.householdId,
    as_of_date: requireDate_(payload.as_of_date || now.slice(0, 10)),
    asset_account_id: requireString_(payload.asset_account_id, "asset_account_id"),
    asset_value: optionalNonNegativeNumber_(payload.asset_value, "asset_value"),
    liability_amount: optionalNonNegativeNumber_(payload.liability_amount, "liability_amount"),
    remarks: payload.remarks || "",
  };
  assertRecordExists_("asset_accounts", "asset_account_id", record.asset_account_id);
  addCreateMetadata_(record, now);
  appendRecord_("asset_snapshots", record);
  appendAudit_("asset_snapshots", record.asset_snapshot_id, "append", {}, record, request);
  return compactRow_(record, WRITE_COLUMNS.asset_snapshots);
}

function appendCaregiverRecord_(payload, request) {
  assertAllowedKeys_(payload, ["caregiver_id", "record_type", "start_at", "end_at", "title", "description", "status", "related_task_id", "remarks"], "append_caregiver_record");
  const now = now_();
  const record = normalizeCaregiverRecordPatch_(payload);
  record.caregiver_record_id = makeId_("cgr");
  record.household_id = FAMILY_OS.householdId;
  record.caregiver_id = requireString_(record.caregiver_id, "caregiver_id");
  record.record_type = requireOneOf_(record.record_type, CAREGIVER_RECORD_TYPES, "record_type");
  record.title = requireString_(record.title, "title");
  record.status = record.status || "active";
  assertCaregiverRecordReferences_(record);
  addCreateMetadata_(record, now);
  appendRecord_("caregiver_records", record);
  appendAudit_("caregiver_records", record.caregiver_record_id, "append", {}, record, request);
  return compactRow_(record, WRITE_COLUMNS.caregiver_records);
}

function updateCaregiverRecord_(payload, request) {
  assertAllowedKeys_(payload, ["caregiver_record_id", "patch"], "update_caregiver_record");
  return updateBusinessRecord_("caregiver_records", "caregiver_record_id", payload.caregiver_record_id, payload.patch, [
    "caregiver_id", "record_type", "start_at", "end_at", "title", "description",
    "status", "related_task_id", "remarks",
  ], normalizeCaregiverRecordPatch_, assertCaregiverRecordReferences_, request);
}

function appendProperty_(payload, request) {
  assertAllowedKeys_(payload, ["visit_date", "estate_name", "district", "address_or_block", "flat_type", "saleable_area_sqft", "bedrooms", "asking_price_hkd", "transport_score", "family_distance_score", "baby_convenience_score", "pros", "cons", "status", "source_url", "remarks"], "append_property");
  const now = now_();
  const record = normalizePropertyPatch_(payload);
  record.property_id = makeId_("prop");
  record.household_id = FAMILY_OS.householdId;
  record.estate_name = requireString_(record.estate_name, "estate_name");
  record.district = requireString_(record.district, "district");
  record.status = record.status || "researched";
  addCreateMetadata_(record, now);
  appendRecord_("properties", record);
  appendAudit_("properties", record.property_id, "append", {}, record, request);
  return compactRow_(record, WRITE_COLUMNS.properties);
}

function updateProperty_(payload, request) {
  assertAllowedKeys_(payload, ["property_id", "patch"], "update_property");
  return updateBusinessRecord_("properties", "property_id", payload.property_id, payload.patch, [
    "visit_date", "estate_name", "district", "address_or_block", "flat_type",
    "saleable_area_sqft", "bedrooms", "asking_price_hkd", "transport_score",
    "family_distance_score", "baby_convenience_score", "pros", "cons", "status",
    "source_url", "remarks",
  ], normalizePropertyPatch_, function () {}, request);
}

function appendPropertyScenario_(payload, request) {
  assertAllowedKeys_(payload, ["property_id", "scenario_name", "purchase_price_hkd", "down_payment_pct", "mortgage_term_years", "annual_interest_rate", "stress_interest_rate", "estimated_upfront_cost_hkd", "current_cash_assets_hkd", "monthly_income_hkd", "monthly_expense_hkd", "status", "remarks"], "append_property_scenario");
  const now = now_();
  const record = normalizePropertyScenarioPatch_(payload);
  record.scenario_id = makeId_("scn");
  record.household_id = FAMILY_OS.householdId;
  record.property_id = requireString_(record.property_id, "property_id");
  record.scenario_name = requireString_(record.scenario_name, "scenario_name");
  record.status = record.status || "active";
  assertPropertyScenario_(record);
  addCreateMetadata_(record, now);
  appendRecord_("property_scenarios", record);
  appendAudit_("property_scenarios", record.scenario_id, "append", {}, record, request);
  return compactRow_(record, WRITE_COLUMNS.property_scenarios);
}

function updatePropertyScenario_(payload, request) {
  assertAllowedKeys_(payload, ["scenario_id", "patch"], "update_property_scenario");
  return updateBusinessRecord_("property_scenarios", "scenario_id", payload.scenario_id, payload.patch, [
    "property_id", "scenario_name", "purchase_price_hkd", "down_payment_pct",
    "mortgage_term_years", "annual_interest_rate", "stress_interest_rate",
    "estimated_upfront_cost_hkd", "current_cash_assets_hkd", "monthly_income_hkd",
    "monthly_expense_hkd", "status", "remarks",
  ], normalizePropertyScenarioPatch_, assertPropertyScenario_, request);
}

function appendDocument_(payload, request) {
  assertAllowedKeys_(payload, ["document_name", "category", "owner_person_id", "storage_location", "issue_date", "expiry_date", "renewal_required", "related_task_id", "status", "remarks"], "append_document");
  const now = now_();
  const record = normalizeDocumentPatch_(payload);
  record.document_id = makeId_("doc");
  record.household_id = FAMILY_OS.householdId;
  record.document_name = requireString_(record.document_name, "document_name");
  record.category = requireOneOf_(record.category, DOCUMENT_CATEGORIES, "category");
  record.status = record.status || "active";
  assertDocumentReferences_(record);
  addCreateMetadata_(record, now);
  appendRecord_("documents", record);
  appendAudit_("documents", record.document_id, "append", {}, record, request);
  return compactRow_(record, WRITE_COLUMNS.documents);
}

function updateDocument_(payload, request) {
  assertAllowedKeys_(payload, ["document_id", "patch"], "update_document");
  return updateBusinessRecord_("documents", "document_id", payload.document_id, payload.patch, [
    "document_name", "category", "owner_person_id", "storage_location", "issue_date",
    "expiry_date", "renewal_required", "related_task_id", "status", "remarks",
  ], normalizeDocumentPatch_, assertDocumentReferences_, request);
}

function appendAudit_(sheetName, recordId, operation, before, after, request) {
  const now = now_();
  appendRecord_("audit_log", {
    audit_id: makeId_("aud"),
    household_id: FAMILY_OS.householdId,
    changed_at: now,
    actor_type: "bot",
    actor_id: request.actor_id || "family-os-api",
    source: "apps_script_web_app",
    sheet_name: sheetName,
    record_id: recordId,
    operation: operation,
    changed_fields_json: JSON.stringify(after),
    before_json: JSON.stringify(before || {}),
    after_json: JSON.stringify(after || {}),
    request_text: request.request_text || "",
    result_status: "success",
    created_at: now,
  });
}

function appendRecord_(sheetName, record) {
  const sheet = sheet_(sheetName);
  const header = headerMap_(sheet);
  const allowed = WRITE_COLUMNS[sheetName];
  if (!allowed) throw new Error("Sheet is not writable through API: " + sheetName);
  const row = nextBlankRow_(sheet);
  allowed.forEach(function (key) {
    if (!Object.prototype.hasOwnProperty.call(record, key)) return;
    if (!header[key]) throw new Error("Missing sheet header: " + sheetName + "." + key);
    sheet.getRange(row, header[key]).setValue(record[key]);
  });
  return row;
}

function rowsAsObjects_(sheetName) {
  const values = sheet_(sheetName).getDataRange().getValues();
  if (!values.length) return [];
  const headers = values[0];
  return values.slice(1).map(function (row) {
    const object = {};
    headers.forEach(function (header, index) {
      if (header) object[String(header)] = row[index];
    });
    return object;
  });
}

function queryRows_(sheetName, idField, payload, options) {
  const safe = copyObject_(payload);
  const dateKeys = options.dateField ? ["from", "to"] : [];
  assertAllowedKeys_(safe, ["limit"].concat(options.filters || [], dateKeys), "query_" + sheetName);
  let rows = rowsWithId_(sheetName, idField).reverse().filter(function (row) {
    return exactFiltersMatch_(row, safe, options.filters || []);
  });
  if (options.dateField && safe.from) {
    const from = parseDate_(safe.from);
    if (!from) throw new Error("Invalid from date.");
    rows = rows.filter(function (row) {
      const value = parseDate_(row[options.dateField]);
      return value && value >= from;
    });
  }
  if (options.dateField && safe.to) {
    const to = parseDate_(safe.to);
    if (!to) throw new Error("Invalid to date.");
    rows = rows.filter(function (row) {
      const value = parseDate_(row[options.dateField]);
      return value && value <= to;
    });
  }
  return limitRows_(rows, safe.limit).map(function (row) {
    return compactRow_(row, options.fields);
  });
}

function rowsWithId_(sheetName, idField) {
  return rowsAsObjects_(sheetName).filter(function (row) { return Boolean(row[idField]); });
}

function limitedRows_(sheetName, idField, limit) {
  return limitRows_(rowsWithId_(sheetName, idField).reverse(), limit);
}

function limitRows_(rows, limit) {
  return rows.slice(0, clampNumber_(limit || 100, 1, 100));
}

function exactFiltersMatch_(row, payload, keys) {
  return keys.every(function (key) {
    if (payload[key] === undefined || payload[key] === null || payload[key] === "") return true;
    if (typeof payload[key] === "boolean") return asBoolean_(row[key]) === payload[key];
    return String(row[key]) === String(payload[key]);
  });
}

function compactRow_(row, fields) {
  const output = pick_(row, fields);
  Object.keys(output).forEach(function (key) {
    if (output[key] instanceof Date) output[key] = Utilities.formatDate(output[key], FAMILY_OS.timezone, "yyyy-MM-dd HH:mm:ssXXX");
  });
  return output;
}

function updateBusinessRecord_(sheetName, idField, id, patch, allowedPatchFields, normalizer, validator, request) {
  const recordId = requireString_(id, idField);
  const safePatch = copyObject_(patch);
  assertAllowedKeys_(safePatch, allowedPatchFields, "patch");
  if (Object.keys(safePatch).length === 0) throw new Error("patch must contain at least one field.");
  const located = findRecordWithRow_(sheetName, idField, recordId);
  if (!located) throw new Error("Unknown " + idField + ": " + recordId);
  const normalized = normalizer(safePatch);
  const now = now_();
  const after = Object.assign({}, located.record, normalized, {
    updated_at: now,
    updated_by: "apps_script",
  });
  validator(after);
  writeRecordFields_(sheetName, located.rowNumber, Object.assign({}, normalized, {
    updated_at: now,
    updated_by: "apps_script",
  }));
  appendAudit_(sheetName, recordId, "update", located.record, after, request);
  return compactRow_(after, WRITE_COLUMNS[sheetName]);
}

function findRecordWithRow_(sheetName, idField, id) {
  const rows = rowsAsObjects_(sheetName);
  for (let index = 0; index < rows.length; index += 1) {
    if (String(rows[index][idField]) === String(id)) {
      return { rowNumber: index + 2, record: rows[index] };
    }
  }
  return null;
}

function findRecord_(sheetName, idField, id) {
  const located = findRecordWithRow_(sheetName, idField, id);
  return located ? located.record : null;
}

function writeRecordFields_(sheetName, rowNumber, changes) {
  const sheet = sheet_(sheetName);
  const header = headerMap_(sheet);
  const allowed = WRITE_COLUMNS[sheetName] || [];
  Object.keys(changes).forEach(function (key) {
    if (allowed.indexOf(key) === -1) throw new Error("Field is not writable through API: " + sheetName + "." + key);
    if (!header[key]) throw new Error("Missing sheet header: " + sheetName + "." + key);
    sheet.getRange(rowNumber, header[key]).setValue(changes[key]);
  });
}

function normalizeInventoryItemPatch_(payload) {
  const record = copyObject_(payload);
  if (hasOwn_(record, "item_name")) record.item_name = requireString_(record.item_name, "item_name");
  if (hasOwn_(record, "canonical_item_name")) record.canonical_item_name = requireString_(record.canonical_item_name, "canonical_item_name");
  if (hasOwn_(record, "category")) record.category = requireOneOf_(record.category, INVENTORY_CATEGORIES, "category");
  if (hasOwn_(record, "target_group")) record.target_group = normalizeInventoryTargetGroup_(record.target_group);
  if (hasOwn_(record, "brand_name")) record.brand_name = optionalString_(record.brand_name);
  if (hasOwn_(record, "unit")) record.unit = normalizeInventoryUnit_(record.unit, "unit");
  if (hasOwn_(record, "safety_stock")) record.safety_stock = optionalNonNegativeNumber_(record.safety_stock, "safety_stock");
  if (hasOwn_(record, "next_expiry_date")) record.next_expiry_date = optionalDate_(record.next_expiry_date);
  if (hasOwn_(record, "status")) record.status = requireOneOf_(record.status, ["active", "inactive", "archived"], "status");
  assertInventoryItemPatch_(record);
  return record;
}

function assertInventoryItemPatch_(record) {
  if (!record.canonical_item_name && record.item_name) {
    record.canonical_item_name = record.item_name;
  }
  if (String(record.unit || "") === "percent" && record.safety_stock !== "" && record.safety_stock !== undefined) {
    const safetyStock = Number(record.safety_stock);
    if (safetyStock < 0 || safetyStock > 100) {
      throw new Error("safety_stock must be between 0 and 100 for percent-tracked inventory.");
    }
  }
}

function normalizeInventoryTargetGroup_(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  return requireOneOf_(text, INVENTORY_TARGET_GROUPS, "target_group");
}

function inferInventoryTargetGroup_(payload) {
  const text = [
    payload.item_name,
    payload.canonical_item_name,
    payload.brand_name,
    payload.remarks,
  ].join(" ").toLowerCase();
  const category = String(payload.category || "").trim().toLowerCase();
  if (category === "baby_consumable") return "baby";
  if (category === "pet_food" || category === "pet_litter" || /(cat|dog|pet|貓|狗)/i.test(text)) return "pet";
  if (/(bb|baby|嬰|初生|奶樽|口水肩|pat pat|尿片)/i.test(text)) return "baby";
  if (/(helper|工人|caregiver)/i.test(text)) return "helper";
  if (category === "groceries" || category === "household_cleaning") return "shared";
  if (category === "personal_care") return "family";
  return "shared";
}

function normalizeTaskPatch_(payload) {
  const record = copyObject_(payload);
  if (hasOwn_(record, "category")) record.category = requireOneOf_(record.category, TASK_CATEGORIES, "category");
  if (hasOwn_(record, "priority")) record.priority = requireOneOf_(record.priority, TASK_PRIORITIES, "priority");
  if (hasOwn_(record, "status")) record.status = requireOneOf_(record.status, TASK_STATUSES, "status");
  if (hasOwn_(record, "recurrence")) record.recurrence = requireOneOf_(record.recurrence, TASK_RECURRENCES, "recurrence");
  if (hasOwn_(record, "due_at")) record.due_at = optionalTimestamp_(record.due_at);
  if (hasOwn_(record, "completed_at")) record.completed_at = optionalTimestamp_(record.completed_at);
  if (record.status === "done" && !record.completed_at) record.completed_at = now_();
  return record;
}

function normalizeFinanceBudgetPatch_(payload) {
  const record = copyObject_(payload);
  if (hasOwn_(record, "month_start")) record.month_start = requireMonthStart_(record.month_start);
  if (hasOwn_(record, "budget_amount_hkd")) record.budget_amount_hkd = nonNegativeNumber_(record.budget_amount_hkd, "budget_amount_hkd");
  return record;
}

function normalizeCaregiverRecordPatch_(payload) {
  const record = copyObject_(payload);
  if (hasOwn_(record, "record_type")) record.record_type = requireOneOf_(record.record_type, CAREGIVER_RECORD_TYPES, "record_type");
  if (hasOwn_(record, "start_at")) record.start_at = optionalTimestamp_(record.start_at);
  if (hasOwn_(record, "end_at")) record.end_at = optionalTimestamp_(record.end_at);
  return record;
}

function normalizePropertyPatch_(payload) {
  const record = copyObject_(payload);
  if (hasOwn_(record, "visit_date")) record.visit_date = optionalDate_(record.visit_date);
  ["saleable_area_sqft", "bedrooms", "asking_price_hkd", "transport_score", "family_distance_score", "baby_convenience_score"].forEach(function (key) {
    if (hasOwn_(record, key)) record[key] = optionalNonNegativeNumber_(record[key], key);
  });
  if (hasOwn_(record, "status")) record.status = requireOneOf_(record.status, PROPERTY_STATUSES, "status");
  return record;
}

function normalizePropertyScenarioPatch_(payload) {
  const record = copyObject_(payload);
  ["purchase_price_hkd", "down_payment_pct", "mortgage_term_years", "annual_interest_rate", "stress_interest_rate", "estimated_upfront_cost_hkd", "current_cash_assets_hkd", "monthly_income_hkd", "monthly_expense_hkd"].forEach(function (key) {
    if (hasOwn_(record, key)) record[key] = optionalNonNegativeNumber_(record[key], key);
  });
  return record;
}

function normalizeDocumentPatch_(payload) {
  const record = copyObject_(payload);
  if (hasOwn_(record, "category")) record.category = requireOneOf_(record.category, DOCUMENT_CATEGORIES, "category");
  if (hasOwn_(record, "issue_date")) record.issue_date = optionalDate_(record.issue_date);
  if (hasOwn_(record, "expiry_date")) record.expiry_date = optionalDate_(record.expiry_date);
  if (hasOwn_(record, "renewal_required")) record.renewal_required = optionalBoolean_(record.renewal_required);
  return record;
}

function assertTaskReferences_(record) {
  assertOptionalRecordExists_("people", "person_id", record.owner_person_id);
  assertOptionalRecordExists_("people", "person_id", record.related_person_id);
  assertOptionalRecordExists_("inventory_items", "item_id", record.related_item_id);
}

function assertCaregiverRecordReferences_(record) {
  assertRecordExists_("caregivers", "caregiver_id", record.caregiver_id);
  assertOptionalRecordExists_("tasks", "task_id", record.related_task_id);
}

function assertDocumentReferences_(record) {
  assertOptionalRecordExists_("people", "person_id", record.owner_person_id);
  assertOptionalRecordExists_("tasks", "task_id", record.related_task_id);
}

function assertPropertyScenario_(record) {
  assertRecordExists_("properties", "property_id", record.property_id);
  record.purchase_price_hkd = positiveNumber_(record.purchase_price_hkd, "purchase_price_hkd");
  record.down_payment_pct = nonNegativeNumber_(record.down_payment_pct, "down_payment_pct");
  if (record.down_payment_pct > 1) throw new Error("down_payment_pct must be between 0 and 1.");
  record.mortgage_term_years = positiveNumber_(record.mortgage_term_years, "mortgage_term_years");
  record.annual_interest_rate = nonNegativeNumber_(record.annual_interest_rate, "annual_interest_rate");
  record.stress_interest_rate = nonNegativeNumber_(record.stress_interest_rate, "stress_interest_rate");
  record.estimated_upfront_cost_hkd = nonNegativeNumber_(record.estimated_upfront_cost_hkd, "estimated_upfront_cost_hkd");
  record.current_cash_assets_hkd = nonNegativeNumber_(record.current_cash_assets_hkd, "current_cash_assets_hkd");
  record.monthly_income_hkd = nonNegativeNumber_(record.monthly_income_hkd, "monthly_income_hkd");
  record.monthly_expense_hkd = nonNegativeNumber_(record.monthly_expense_hkd, "monthly_expense_hkd");
}

function assertOptionalRecordExists_(sheetName, idField, id) {
  if (id === undefined || id === null || id === "") return;
  assertRecordExists_(sheetName, idField, String(id));
}

function assertAllowedKeys_(object, allowed, context) {
  Object.keys(object || {}).forEach(function (key) {
    if (allowed.indexOf(key) === -1) throw new Error("Unsupported " + context + " field: " + key);
  });
}

function addCreateMetadata_(record, now) {
  record.created_at = now;
  record.updated_at = now;
  record.created_by = "apps_script";
  record.updated_by = "apps_script";
}

function copyObject_(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.assign({}, value);
}

function hasOwn_(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function assertSchema_() {
  const rows = rowsAsObjects_("households");
  const household = rows.find(function (row) {
    return row.household_id === FAMILY_OS.householdId;
  });
  if (!household) throw new Error("Household binding not found.");
  if (household.schema_version !== FAMILY_OS.schemaVersion) {
    throw new Error("Schema version mismatch: " + household.schema_version);
  }
}

function assertRecordExists_(sheetName, idField, id) {
  const exists = rowsAsObjects_(sheetName).some(function (row) {
    return row[idField] === id;
  });
  if (!exists) throw new Error("Unknown " + idField + ": " + id);
}

function assertApiKey_(provided) {
  const expected = PropertiesService.getScriptProperties().getProperty("FAMILY_OS_API_KEY");
  if (!expected) throw new Error("Missing FAMILY_OS_API_KEY script property.");
  if (!provided || !constantTimeEqual_(String(provided), String(expected))) {
    throw new Error("Unauthorized.");
  }
}

function parseRequest_(e) {
  if (!e || !e.postData || !e.postData.contents) throw new Error("JSON body required.");
  const request = JSON.parse(e.postData.contents);
  if (!request.action) throw new Error("action is required.");
  return request;
}

function sheet_(name) {
  return spreadsheet_().getSheetByName(name) || (function () {
    throw new Error("Missing sheet: " + name);
  })();
}

function spreadsheet_() {
  const override = PropertiesService.getScriptProperties().getProperty("FAMILY_OS_SPREADSHEET_ID");
  return SpreadsheetApp.openById(override || FAMILY_OS.spreadsheetId);
}

function headerMap_(sheet) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const map = {};
  headers.forEach(function (header, index) {
    if (header) map[String(header)] = index + 1;
  });
  return map;
}

function nextBlankRow_(sheet) {
  const last = Math.max(sheet.getLastRow(), 2);
  const ids = sheet.getRange(2, 1, last - 1, 1).getValues();
  for (let index = 0; index < ids.length; index += 1) {
    if (!ids[index][0]) return index + 2;
  }
  return last + 1;
}

function withWriteLock_(callback) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    return callback();
  } finally {
    lock.releaseLock();
  }
}

function compactTask_(row) {
  return pick_(row, [
    "task_id", "category", "task_name", "description", "owner_person_id", "due_at",
    "priority", "status", "related_person_id", "related_item_id", "remarks",
  ]);
}

function pick_(object, keys) {
  const output = {};
  keys.forEach(function (key) {
    output[key] = object[key] === undefined ? "" : object[key];
  });
  return output;
}

function hasId_(field) {
  return function (row) {
    return Boolean(row[field]);
  };
}

function makeId_(prefix) {
  return prefix + "_" + Utilities.formatDate(new Date(), FAMILY_OS.timezone, "yyyyMMdd_HHmmss") + "_" +
    Utilities.getUuid().slice(0, 6);
}

function now_() {
  return Utilities.formatDate(new Date(), FAMILY_OS.timezone, "yyyy-MM-dd HH:mm:ssXXX");
}

function timestamp_(value) {
  if (value instanceof Date) return Utilities.formatDate(value, FAMILY_OS.timezone, "yyyy-MM-dd HH:mm:ssXXX");
  let text = String(value).trim().replace("T", " ");
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(text)) text += ":00";
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text)) text += "+08:00";
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\+08:00$/.test(text)) {
    throw new Error("Invalid timestamp. Use yyyy-mm-dd hh:mm:ss+08:00.");
  }
  if (!parseDate_(text)) throw new Error("Invalid timestamp value.");
  return text;
}

function parseDate_(value) {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(String(value).replace(" ", "T"));
  return isNaN(parsed.getTime()) ? null : parsed;
}

function requireDate_(value) {
  const text = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || !parseDate_(text + "T00:00:00+08:00")) {
    throw new Error("Invalid date. Use yyyy-mm-dd.");
  }
  return text;
}

function requireMonth_(value) {
  const text = String(value);
  if (!/^\d{4}-\d{2}$/.test(text)) throw new Error("Invalid month. Use yyyy-mm.");
  return text;
}

function requireMonthStart_(value) {
  const text = String(value || "");
  if (/^\d{4}-\d{2}$/.test(text)) return text + "-01";
  const date = requireDate_(text);
  if (date.slice(8, 10) !== "01") throw new Error("month_start must be the first day of a month.");
  return date;
}

function monthOf_(value) {
  const date = parseDate_(value);
  return date ? Utilities.formatDate(date, FAMILY_OS.timezone, "yyyy-MM") : String(value).slice(0, 7);
}

function formatDateValue_(value) {
  if (!value) return "";
  if (value instanceof Date) return Utilities.formatDate(value, FAMILY_OS.timezone, "yyyy-MM-dd");
  return String(value).slice(0, 10);
}

function requireString_(value, name) {
  if (value === undefined || value === null || String(value).trim() === "") {
    throw new Error(name + " is required.");
  }
  return String(value).trim();
}

function optionalString_(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function requireOneOf_(value, allowed, name) {
  const text = requireString_(value, name);
  if (allowed.indexOf(text) === -1) throw new Error("Invalid " + name + ": " + text);
  return text;
}

function normalizeInventoryUnit_(value, name) {
  const raw = requireString_(value, name);
  const key = normalizeInventoryUnitKey_(raw);
  const aliases = {
    piece: "piece",
    pieces: "piece",
    pc: "piece",
    pcs: "piece",
    each: "piece",
    unit: "piece",
    item: "piece",
  };
  Object.assign(aliases, {
    pack: "pack",
    packs: "pack",
    pkg: "pack",
    pk: "pack",
    package: "pack",
    packages: "pack",
    pouch: "pack",
    pouches: "pack",
    box: "box",
    boxes: "box",
    carton: "box",
    cartons: "box",
    case: "box",
    cases: "box",
    bottle: "bottle",
    bottles: "bottle",
    bt: "bottle",
    jar: "bottle",
    jars: "bottle",
    can: "can",
    cans: "can",
    tin: "can",
    tins: "can",
    cup: "cup",
    cups: "cup",
    roll: "roll",
    rolls: "roll",
    kg: "kg",
    kgs: "kg",
    kilogram: "kg",
    kilograms: "kg",
    kilo: "kg",
    kilos: "kg",
    g: "g",
    gram: "g",
    grams: "g",
    ml: "ml",
    milliliter: "ml",
    milliliters: "ml",
    millilitre: "ml",
    millilitres: "ml",
    percent: "percent",
    percentage: "percent",
    pct: "percent",
    "%": "percent",
  });
  /*
    "個": "piece",
    "件": "piece",
    "粒": "piece",
    pack: "pack",
    packs: "pack",
    pkg: "pack",
    pk: "pack",
    package: "pack",
    packages: "pack",
    pouch: "pack",
    pouches: "pack",
    "包": "pack",
    "袋": "pack",
    box: "box",
    boxes: "box",
    carton: "box",
    cartons: "box",
    case: "box",
    cases: "box",
    "盒": "box",
    "箱": "box",
    bottle: "bottle",
    bottles: "bottle",
    bt: "bottle",
    jar: "bottle",
    jars: "bottle",
    "樽": "bottle",
    "支": "bottle",
    "枝": "bottle",
    can: "can",
    cans: "can",
    tin: "can",
    tins: "can",
    "罐": "can",
    cup: "cup",
    cups: "cup",
    "杯": "cup",
    roll: "roll",
    rolls: "roll",
    "卷": "roll",
    kg: "kg",
    kgs: "kg",
    kilogram: "kg",
    kilograms: "kg",
    kilo: "kg",
    kilos: "kg",
    "公斤": "kg",
    "千克": "kg",
    g: "g",
    gram: "g",
    grams: "g",
    "克": "g",
    ml: "ml",
    milliliter: "ml",
    milliliters: "ml",
    millilitre: "ml",
    millilitres: "ml",
    "毫升": "ml",
    percent: "percent",
    percentage: "percent",
    pct: "percent",
    "%": "percent",
  };
  */
  const normalized = aliases[key] || "";
  if (!normalized || INVENTORY_UNITS.indexOf(normalized) === -1) {
    throw new Error("Invalid " + name + ": " + raw);
  }
  return normalized;
}

function normalizeInventoryUnitKey_(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[.\-_]/g, "")
    .replace(/\s+/g, "");
}

function requireNumber_(value, name) {
  const number = Number(value);
  if (!isFinite(number)) throw new Error(name + " must be numeric.");
  return number;
}

function optionalNumber_(value) {
  if (value === undefined || value === null || value === "") return "";
  return requireNumber_(value, "numeric value");
}

function nonNegativeNumber_(value, name) {
  const number = requireNumber_(value, name);
  if (number < 0) throw new Error(name + " must not be negative.");
  return number;
}

function positiveNumber_(value, name) {
  const number = requireNumber_(value, name);
  if (number <= 0) throw new Error(name + " must be positive.");
  return number;
}

function optionalNonNegativeNumber_(value, name) {
  if (value === undefined || value === null || value === "") return "";
  const number = requireNumber_(value, name);
  if (number < 0) throw new Error(name + " must not be negative.");
  return number;
}

function optionalDate_(value) {
  if (value === undefined || value === null || value === "") return "";
  return requireDate_(value);
}

function optionalTimestamp_(value) {
  if (value === undefined || value === null || value === "") return "";
  return timestamp_(value);
}

function optionalBoolean_(value) {
  if (value === undefined || value === null || value === "") return false;
  if (value === true || value === false) return value;
  const text = String(value).toLowerCase();
  if (text === "true") return true;
  if (text === "false") return false;
  throw new Error("Boolean value must be true or false.");
}

function requireSlug_(value, name) {
  const text = requireString_(value, name);
  if (!/^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(text)) {
    throw new Error(name + " must use lowercase snake_case.");
  }
  return text;
}

function normalizeName_(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, "");
}

function clampNumber_(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, Math.round(requireNumber_(value, "number"))));
}

function asBoolean_(value) {
  return value === true || String(value).toLowerCase() === "true";
}

function constantTimeEqual_(left, right) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

function json_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
