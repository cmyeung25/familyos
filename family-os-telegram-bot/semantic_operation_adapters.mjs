export function normalizeSemanticEntity(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return "";
  if (["inventory", "stock", "item", "items", "庫存", "存貨", "物資", "用品", "groceries"].includes(text)) return "inventory";
  if (["baby", "bb", "嬰兒", "寶寶"].includes(text)) return "baby";
  if (["task", "tasks", "reminder", "todo", "to-do", "提醒", "待辦", "工作"].includes(text)) return "task";
  if (["shopping", "buy", "purchase", "grocery", "shopping_list", "購物", "買嘢", "買野", "補貨"].includes(text)) return "shopping";
  if (["finance", "money", "expense", "income", "cashflow", "財務", "支出", "收入", "現金流"].includes(text)) return "finance";
  if (["document", "documents", "doc", "paperwork", "文件", "證件"].includes(text)) return "document";
  if (["property", "properties", "home_search", "real_estate", "樓", "物業", "睇樓", "買樓"].includes(text)) return "property";
  if (["caregiver", "helper", "maid", "工人", "照顧者"].includes(text)) return "caregiver";
  if (["asset", "assets", "account", "wealth", "資產", "戶口", "帳戶", "账户"].includes(text)) return "asset";
  return "";
}

export function normalizeSemanticAction(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return "";
  if (["query", "check", "look_up", "lookup", "view", "show", "find", "ask", "查", "查看", "睇", "問"].includes(text)) return "query";
  if (["create", "add", "new", "append", "make", "記低", "新增", "建立", "加入"].includes(text)) return "create";
  if (["record", "log", "note", "track", "紀錄", "記錄", "登記"].includes(text)) return "record";
  if (["set_level", "set", "count", "inventory_count", "stocktake", "盤點", "得返", "剩返", "剩下"].includes(text)) return "set_level";
  if (["consume", "use", "used", "spent", "eat", "ate", "open", "consumed", "用咗", "用了", "食咗", "食左", "開咗", "開左"].includes(text)) return "consume";
  if (["restore", "undo", "return", "add_back", "correction", "加返", "還原", "更正", "撤回"].includes(text)) return "restore";
  if (["restock", "buy", "bought", "purchase", "top_up", "refill", "補貨", "買", "入貨"].includes(text)) return "restock";
  return "";
}

export function createSemanticOperationPlanner(deps) {
  const {
    findBestInventoryMatch,
    inferInventoryCategory,
    normalizeBabyQueryScope,
    normalizeCaregiverRecordType,
    normalizeDiaperOutputValue,
    normalizeDocumentCategoryHint,
    normalizeFinanceCategoryHint,
    normalizeFinanceType,
    normalizePropertyStatus,
    normalizeSemanticDate,
    normalizeSemanticTimestamp,
    normalizeTaskCategoryHint,
    normalizeTaskPriority,
    normalizeTaskStatus,
    resolveSemanticInventoryUnit,
    slugifyInventoryItemName,
  } = deps;

  function readText(operation, ...keys) {
    for (const key of keys) {
      const value = operation?.[key];
      if (value === undefined || value === null) continue;
      const text = String(value).trim();
      if (text) return text;
    }
    return "";
  }

  function readNumber(operation, ...keys) {
    for (const key of keys) {
      const value = operation?.[key];
      const number = Number(value);
      if (Number.isFinite(number)) return number;
    }
    return Number.NaN;
  }

  function buildSemanticOperationPlan(operation, userText, inventorySnapshot) {
    const entity = normalizeSemanticEntity(operation?.entity);
    const action = normalizeSemanticAction(operation?.action);
    if (!entity || !action) return null;
    const normalized = { ...operation, entity, action };
    const handler = getSemanticOperationHandler(entity, action);
    return handler ? handler(normalized, userText, inventorySnapshot) : null;
  }

  function semanticOperationKey(entity, action) {
    return `${entity}:${action}`;
  }

  function buildPlan(entity, action, intent, summary, primaryRequest, followUpRequests = []) {
    return {
      entity,
      action,
      intent,
      summary,
      primaryRequest,
      followUpRequests,
    };
  }

  function buildInventoryOperationState(operation, userText, snapshot) {
    const itemName = readText(operation, "item_name", "subject", "title", "name");
    const quantity = readNumber(operation, "quantity");
    const unitHint = readText(operation, "unit_hint", "unit");
    if (!itemName || !Number.isFinite(quantity) || quantity < 0) return null;
    const match = findBestInventoryMatch(snapshot, itemName, unitHint, userText);
    const unit = resolveSemanticInventoryUnit(match, itemName, unitHint, userText);
    const remarks = readText(operation, "remarks", "note", "description");
    return { itemName, quantity, unitHint, match, unit, remarks };
  }

  function buildInventoryBatchOperationStates(operation, userText, snapshot) {
    const fallbackItems = !Array.isArray(operation?.items) || operation.items.length === 0
      ? extractInventoryRestockItemsFromText(userText)
      : [];
    const rawItems = fallbackItems.length > 1
      ? fallbackItems
      : Array.isArray(operation?.items) && operation.items.length > 0
      ? operation.items
      : [operation];
    const states = rawItems
      .map((rawItem) => {
        const itemName = readText(rawItem, "item_name", "subject", "title", "name");
        const quantity = readNumber(rawItem, "quantity");
        const unitHint = readText(rawItem, "unit_hint", "unit");
        if (!itemName || !Number.isFinite(quantity) || quantity < 0) return null;
        const candidateMatch = findBestInventoryMatch(snapshot, itemName, unitHint, userText);
        const unit = resolveSemanticInventoryUnit(candidateMatch, itemName, unitHint, userText);
        const matchUnit = String(candidateMatch?.unit || "").trim();
        const unitMismatch = Boolean(candidateMatch && unit && matchUnit && matchUnit !== unit);
        const match = unitMismatch ? null : candidateMatch;
        const remarks = readText(rawItem, "remarks", "note", "description") || readText(operation, "remarks", "note", "description");
        const expiryDate = normalizeSemanticDate(readText(rawItem, "expiry_date", "date", "when"));
        return { itemName, quantity, unitHint, match, unit, remarks, expiryDate, unitMismatch };
      })
      .filter(Boolean);
    return states.length > 0 ? states : null;
  }

  function extractInventoryRestockItemsFromText(userText) {
    const text = String(userText || "").trim();
    if (!text || !/(買咗|買左|買了|買|入咗|入左|入了|補咗|補左|購入|purchase|bought)/i.test(text)) {
      return [];
    }
    const segments = text
      .split(/\n|(?:^|\s)(?:仲有|另外|同埋|還有)(?:\s|$)|[，,。；;]/)
      .map((segment) => segment.trim())
      .filter(Boolean);
    if (segments.length < 2) return [];
    return segments
      .map((segment) => parseInventoryRestockSegment(segment))
      .filter(Boolean);
  }

  function parseInventoryRestockSegment(segment) {
    const normalized = String(segment || "").trim();
    if (!normalized) return null;
    const expiryDate = parseLooseDate(normalized);
    const withoutDate = normalized
      .replace(/\d{2,4}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*(?:日|號)?\s*(?:到期)?/g, "")
      .replace(/\d{4}[-/]\d{1,2}[-/]\d{1,2}\s*(?:到期)?/g, "")
      .replace(/到期/g, "")
      .trim();
    const quantityPattern = "(\\d+(?:\\.\\d+)?|[零〇一二兩三四五六七八九十半]+)";
    const unitPattern = "(ml|毫升|片|包|盒|樽|支|罐|卷|杯|個|件|粒|%|percent)";
    const afterVerb = withoutDate.match(new RegExp(`^(?:買咗|買左|買了|買|入咗|入左|入了|補咗|補左|購入|purchase|bought)?\\s*${quantityPattern}\\s*${unitPattern}\\s*(.+)$`, "i"));
    if (afterVerb) {
      return {
        subject: cleanupParsedInventoryName(afterVerb[3]),
        quantity: parseLooseQuantity(afterVerb[1]),
        unit: afterVerb[2],
        date: expiryDate,
      };
    }
    const beforeVerb = withoutDate.match(new RegExp(`^(.+?)(?:買咗|買左|買了|買|入咗|入左|入了|補咗|補左|購入)\\s*${quantityPattern}\\s*${unitPattern}$`, "i"));
    if (beforeVerb) {
      return {
        subject: cleanupParsedInventoryName(beforeVerb[1]),
        quantity: parseLooseQuantity(beforeVerb[2]),
        unit: beforeVerb[3],
        date: expiryDate,
      };
    }
    return null;
  }

  function parseLooseQuantity(value) {
    const text = String(value || "").trim();
    const number = Number(text);
    if (Number.isFinite(number)) return number;
    if (text === "半") return 0.5;
    const digits = {
      零: 0,
      "〇": 0,
      一: 1,
      二: 2,
      兩: 2,
      三: 3,
      四: 4,
      五: 5,
      六: 6,
      七: 7,
      八: 8,
      九: 9,
    };
    if (Object.prototype.hasOwnProperty.call(digits, text)) return digits[text];
    if (text === "十") return 10;
    const teen = text.match(/^十([一二兩三四五六七八九])$/);
    if (teen) return 10 + digits[teen[1]];
    const tens = text.match(/^([一二兩三四五六七八九])十([一二兩三四五六七八九])?$/);
    if (tens) return digits[tens[1]] * 10 + (tens[2] ? digits[tens[2]] : 0);
    return Number.NaN;
  }

  function parseLooseDate(value) {
    const text = String(value || "");
    const chinese = text.match(/(\d{2,4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*(?:日|號)?/);
    if (chinese) {
      const rawYear = Number(chinese[1]);
      const year = rawYear < 100 ? 2000 + rawYear : rawYear;
      return `${year}-${String(Number(chinese[2])).padStart(2, "0")}-${String(Number(chinese[3])).padStart(2, "0")}`;
    }
    const iso = text.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (iso) {
      return `${iso[1]}-${String(Number(iso[2])).padStart(2, "0")}-${String(Number(iso[3])).padStart(2, "0")}`;
    }
    return "";
  }

  function cleanupParsedInventoryName(value) {
    return String(value || "")
      .replace(/^(?:咗|左|了)\s*/g, "")
      .replace(/\s*(?:幫我更新存貨|更新存貨|入存貨|記低)$/g, "")
      .trim();
  }

  function buildQueryPlanFromSpec(operation, userText, spec) {
    const scope = readText(operation, "query_scope", "log_scope", "scope", "type").toLowerCase();
    const resolved = typeof spec?.resolve === "function" ? spec.resolve(scope, operation, userText) : spec;
    if (!resolved) return null;
    const payload = typeof resolved.payload === "function"
      ? resolved.payload(scope, operation, userText)
      : (resolved.payload || {});
    return buildPlan(
      operation.entity,
      operation.action,
      resolved.intent,
      resolved.summary,
      {
        action: resolved.action,
        payload,
        request_text: userText,
      },
    );
  }

  const QUERY_OPERATION_SPECS = {
    shopping: {
      intent: "query shopping and restock needs",
      summary: "Look up what the household should buy or restock.",
      action: "get_dashboard_snapshot",
      payload: { month: "2026-06", days: 7 },
    },
    inventory: {
      resolve(scope) {
        const isLowStock = scope === "low_stock" || /restock|low/.test(scope);
        return {
          intent: isLowStock ? "query low-stock inventory" : "query inventory snapshot",
          summary: isLowStock ? "Look up items that need restock." : "Look up current inventory.",
          action: isLowStock ? "get_low_stock_items" : "get_inventory_snapshot",
          payload: {},
        };
      },
    },
    baby: {
      resolve(scope) {
        const normalizedScope = normalizeBabyQueryScope(scope);
        return {
          intent: "query recent baby logs",
          summary: "Look up recent baby records.",
          action: "get_recent_baby_logs",
          payload: normalizedScope ? { log_type: normalizedScope, limit: 5 } : { limit: 5 },
        };
      },
    },
    task: {
      resolve(scope) {
        if (scope === "overdue") {
          return { intent: "query overdue tasks", summary: "Look up overdue tasks.", action: "get_overdue_tasks", payload: {} };
        }
        if (scope === "upcoming" || scope === "today" || scope === "soon") {
          return {
            intent: "query upcoming tasks",
            summary: "Look up upcoming tasks.",
            action: "get_upcoming_tasks",
            payload: { days: scope === "today" ? 1 : 7 },
          };
        }
        return { intent: "query tasks", summary: "Look up tasks.", action: "query_tasks", payload: { limit: 10 } };
      },
    },
    finance: {
      resolve(scope) {
        const transactions = scope === "transactions";
        return {
          intent: transactions ? "query finance transactions" : "query monthly cashflow",
          summary: transactions ? "Look up recent finance transactions." : "Look up the monthly cashflow summary.",
          action: transactions ? "query_finance_transactions" : "get_monthly_cashflow",
          payload: transactions ? { month: "2026-06", limit: 10 } : { month: "2026-06" },
        };
      },
    },
    document: {
      resolve(scope) {
        const expiring = /expiry|expiring/.test(scope);
        return {
          intent: expiring ? "query expiring documents" : "query documents",
          summary: expiring ? "Look up documents that are nearing expiry." : "Look up household documents.",
          action: expiring ? "get_expiring_documents" : "query_documents",
          payload: { limit: 10 },
        };
      },
    },
    property: {
      resolve(scope) {
        const scenarios = /scenario|budget|afford/.test(scope);
        return {
          intent: scenarios ? "query property scenarios" : "query properties",
          summary: scenarios ? "Look up property scenarios." : "Look up property records.",
          action: scenarios ? "query_property_scenarios" : "query_properties",
          payload: { limit: 10 },
        };
      },
    },
    caregiver: {
      resolve(scope) {
        const records = /record|leave|schedule|handover/.test(scope);
        return {
          intent: records ? "query caregiver records" : "query caregivers",
          summary: records ? "Look up caregiver records." : "Look up caregivers.",
          action: records ? "query_caregiver_records" : "query_caregivers",
          payload: { limit: 10 },
        };
      },
    },
    asset: {
      resolve(scope) {
        const accounts = /account/.test(scope);
        return {
          intent: accounts ? "query asset accounts" : "query asset snapshot",
          summary: accounts ? "Look up asset accounts." : "Look up the latest asset values.",
          action: accounts ? "query_asset_accounts" : "get_latest_asset_values",
          payload: { limit: 10 },
        };
      },
    },
  };

  function buildCreatePlanFromSpec(operation, userText, spec) {
    const subject = spec.subjectKeys ? readText(operation, ...spec.subjectKeys) : "";
    const state = typeof spec.prepare === "function"
      ? spec.prepare({ operation, userText, subject })
      : {};
    if (state === null) return null;
    const payload = spec.buildPayload({ operation, userText, subject, state });
    if (!payload) return null;
    const intent = typeof spec.intent === "function" ? spec.intent({ operation, userText, subject, state }) : spec.intent;
    const summary = typeof spec.summary === "function" ? spec.summary({ operation, userText, subject, state }) : spec.summary;
    return buildPlan(
      operation.entity,
      operation.action,
      intent,
      summary,
      {
        action: spec.action,
        payload,
        request_text: userText,
      },
    );
  }

  const CREATE_OPERATION_SPECS = {
    document: {
      action: "append_document",
      subjectKeys: ["document_name", "subject", "item_name", "title", "name"],
      prepare({ subject }) {
        if (!subject) return null;
        return {};
      },
      intent: "record household document",
      summary: ({ subject }) => `Record household document ${subject}.`,
      buildPayload({ operation, userText, subject }) {
        return {
          document_name: subject,
          category: normalizeDocumentCategoryHint(readText(operation, "category_hint", "scope", "type"), subject, userText),
          owner_person_id: readText(operation, "owner_person_id", "who", "reference_id"),
          storage_location: readText(operation, "storage_location", "where", "location"),
          expiry_date: normalizeSemanticDate(readText(operation, "expiry_date", "date", "when")),
          status: "active",
          remarks: readText(operation, "remarks", "note", "description"),
        };
      },
    },
    property: {
      action: "append_property",
      subjectKeys: ["estate_name", "subject", "item_name", "title", "name"],
      prepare({ operation, subject }) {
        const district = readText(operation, "district", "where", "location");
        if (!subject || !district) return null;
        return { district };
      },
      intent: "record property note",
      summary: ({ subject, state }) => `Record property ${subject} in ${state.district}.`,
      buildPayload({ operation, subject, state }) {
        return {
          estate_name: subject,
          district: state.district,
          visit_date: normalizeSemanticDate(readText(operation, "visit_date", "date", "when")),
          status: normalizePropertyStatus(readText(operation, "status", "type")),
          remarks: readText(operation, "remarks", "note", "description"),
        };
      },
    },
    caregiver: {
      action: "append_caregiver_record",
      subjectKeys: ["title", "task_name", "subject", "item_name", "name"],
      prepare({ operation, subject, userText }) {
        const caregiverId = readText(operation, "caregiver_id", "reference_id", "who");
        if (!caregiverId || !subject) return null;
        return {
          caregiverId,
          recordType: normalizeCaregiverRecordType(readText(operation, "record_type", "type", "scope"), userText),
        };
      },
      intent: "record caregiver note",
      summary: ({ state }) => `Record caregiver note for ${state.caregiverId}.`,
      buildPayload({ operation, subject, state }) {
        return {
          caregiver_id: state.caregiverId,
          record_type: state.recordType,
          title: subject,
          description: readText(operation, "description", "note"),
          start_at: normalizeSemanticTimestamp(readText(operation, "due_at", "as_of_date", "when", "date")),
          status: "active",
          remarks: readText(operation, "remarks", "note"),
        };
      },
    },
    asset: {
      action: "append_asset_snapshot",
      prepare({ operation }) {
        const assetAccountId = readText(operation, "asset_account_id", "reference_id", "subject");
        const assetValue = readNumber(operation, "asset_value", "amount");
        const liabilityAmount = operation?.liability_amount === undefined ? "" : readNumber(operation, "liability_amount");
        if (!assetAccountId || (!Number.isFinite(assetValue) && !Number.isFinite(liabilityAmount))) return null;
        return { assetAccountId, assetValue, liabilityAmount };
      },
      intent: "record asset snapshot",
      summary: ({ state }) => `Record asset snapshot for ${state.assetAccountId}.`,
      buildPayload({ operation, state }) {
        return {
          asset_account_id: state.assetAccountId,
          as_of_date: normalizeSemanticDate(readText(operation, "as_of_date", "date", "when")) || "2026-06-04",
          asset_value: Number.isFinite(state.assetValue) ? state.assetValue : "",
          liability_amount: Number.isFinite(state.liabilityAmount) ? state.liabilityAmount : "",
          remarks: readText(operation, "remarks", "note", "description"),
        };
      },
    },
  };

  function buildMutationPlanFromSpec(operation, userText, spec) {
    const subject = spec.subjectKeys ? readText(operation, ...spec.subjectKeys) : "";
    const state = typeof spec.prepare === "function"
      ? spec.prepare({ operation, userText, subject })
      : {};
    if (state === null) return null;
    const primaryRequest = spec.buildPrimaryRequest({ operation, userText, subject, state });
    if (!primaryRequest) return null;
    const followUpRequests = typeof spec.buildFollowUpRequests === "function"
      ? (spec.buildFollowUpRequests({ operation, userText, subject, state }) || [])
      : [];
    const intent = typeof spec.intent === "function" ? spec.intent({ operation, userText, subject, state }) : spec.intent;
    const summary = typeof spec.summary === "function" ? spec.summary({ operation, userText, subject, state }) : spec.summary;
    return buildPlan(
      operation.entity,
      operation.action,
      intent,
      summary,
      {
        ...primaryRequest,
        request_text: primaryRequest.request_text || userText,
      },
      followUpRequests,
    );
  }

  const RECORD_OPERATION_SPECS = {
    baby: {
      prepare({ operation }) {
        const valueNumber = readNumber(operation, "quantity");
        if (Number.isFinite(valueNumber) && valueNumber > 0) {
          return { variant: "feeding", valueNumber };
        }
        const output = normalizeDiaperOutputValue(readText(operation, "value_text", "type", "scope", "note"));
        if (!output) return null;
        return { variant: "diaper", output };
      },
      intent: ({ state }) => (state.variant === "feeding" ? "record baby milk feeding" : "record baby diaper change"),
      summary: ({ state }) => (
        state.variant === "feeding"
          ? `Record BB milk feeding ${state.valueNumber} ml.`
          : `Record BB diaper change: ${state.output}.`
      ),
      buildPrimaryRequest({ operation, userText, state }) {
        if (state.variant === "feeding") {
          return {
            action: "append_baby_log",
            payload: {
              log_type: "feeding",
              log_subtype: "milk",
              value_number: state.valueNumber,
              unit: "ml",
              remarks: readText(operation, "remarks", "note", "description") || "Recorded through Telegram semantic household flow.",
            },
            request_text: userText,
          };
        }
        return {
          action: "append_baby_log",
          payload: {
            log_type: "diaper",
            value_text: state.output,
            description: `BB 換片：${state.output}`,
            remarks: readText(operation, "remarks", "note", "description") || "Recorded through Telegram semantic household flow.",
          },
          request_text: userText,
        };
      },
    },
    task: {
      subjectKeys: ["task_name", "subject", "item_name", "title", "name"],
      prepare({ operation, subject }) {
        if (!subject) return null;
        return {
          description: readText(operation, "description", "note"),
        };
      },
      intent: "create household reminder task",
      summary: ({ subject }) => `Create a task reminder for ${subject}.`,
      buildPrimaryRequest({ operation, userText, subject, state }) {
        return {
          action: "append_task",
          payload: {
            category: normalizeTaskCategoryHint(readText(operation, "category_hint", "scope", "type"), subject, userText),
            task_name: subject,
            description: state.description,
            due_at: normalizeSemanticTimestamp(readText(operation, "due_at", "when", "date")),
            priority: normalizeTaskPriority(readText(operation, "priority", "type")),
            status: normalizeTaskStatus(readText(operation, "status")),
            remarks: readText(operation, "remarks", "note"),
          },
          request_text: userText,
        };
      },
    },
    finance: {
      prepare({ operation }) {
        const amount = readNumber(operation, "amount");
        const type = normalizeFinanceType(readText(operation, "type", "scope"));
        if (!Number.isFinite(amount) || amount <= 0 || !type) return null;
        return { amount, type };
      },
      intent: "record finance transaction",
      summary: ({ state }) => `Record a ${state.type} transaction for ${state.amount} HKD.`,
      buildPrimaryRequest({ operation, userText, state }) {
        return {
          action: "append_finance_transaction",
          payload: {
            transaction_date: "2026-06-04",
            type: state.type,
            category: normalizeFinanceCategoryHint(readText(operation, "category_hint", "scope", "type"), userText),
            item_name: readText(operation, "item_name", "subject", "title"),
            amount: state.amount,
            currency: "HKD",
            remarks: readText(operation, "remarks", "note", "description"),
          },
          request_text: userText,
        };
      },
    },
  };

  const INVENTORY_MUTATION_SPECS = {
    set_level: {
      prepare({ operation, userText, inventorySnapshot }) {
        return buildInventoryOperationState(operation, userText, inventorySnapshot);
      },
      intent: "set current stock level",
      summary: ({ state }) => (
        state.match
          ? `Set ${state.match.item_name} current stock level to ${state.quantity} ${state.match.unit}.`
          : `Create ${state.itemName} if needed, then set its current stock level to ${state.quantity} ${state.unit}.`
      ),
      buildPrimaryRequest({ userText, state }) {
        if (!state) return null;
        if (!state.match) {
          return {
            action: "upsert_inventory_item",
            payload: {
              item_key: slugifyInventoryItemName(state.itemName),
              item_name: state.itemName,
              category: inferInventoryCategory(state.itemName, userText),
              unit: state.unit,
              remarks: state.remarks || "Created through Telegram semantic inventory flow.",
            },
            request_text: `${userText}\nSemantic intent: set current stock level.`,
          };
        }
        return {
          action: "set_inventory_stock_level",
          payload: {
            item_id: state.match.item_id,
            item_name: state.match.item_name,
            unit: state.match.unit,
            quantity_on_hand: state.quantity,
            remarks: state.remarks || "Set current stock level through Telegram semantic inventory flow.",
          },
          request_text: `${userText}\nSemantic intent: set current stock level.`,
        };
      },
      buildFollowUpRequests({ userText, state }) {
        if (!state || state.match) return [];
        return [{
          action: "set_inventory_stock_level",
          payload: {
            item_name: state.itemName,
            unit: state.unit,
            quantity_on_hand: state.quantity,
            remarks: state.remarks || "Set current stock level through Telegram semantic inventory flow.",
          },
          request_text: `${userText}\nSemantic follow-up: set stock level to ${state.quantity} ${state.unit}.`,
        }];
      },
    },
    consume: {
      prepare({ operation, userText, inventorySnapshot }) {
        const state = buildInventoryOperationState(operation, userText, inventorySnapshot);
        return state?.match ? state : null;
      },
      intent: "consume inventory",
      summary: ({ state }) => `Consume ${state.quantity} ${state.match.unit} of ${state.match.item_name}.`,
      buildPrimaryRequest({ userText, state }) {
        if (!state) return null;
        return {
          action: "record_inventory_consume_batch",
          payload: {
            items: [{
              item_id: state.match.item_id,
              item_name: state.match.item_name,
              unit: state.match.unit,
              quantity: state.quantity,
              remarks: state.remarks || "Consumed through Telegram semantic inventory flow.",
            }],
          },
          request_text: `${userText}\nSemantic intent: consume inventory.`,
        };
      },
    },
    restore: {
      prepare({ operation, userText, inventorySnapshot }) {
        const state = buildInventoryOperationState(operation, userText, inventorySnapshot);
        return state?.match ? state : null;
      },
      intent: "restore inventory",
      summary: ({ state }) => `Add back ${state.quantity} ${state.match.unit} of ${state.match.item_name}.`,
      buildPrimaryRequest({ userText, state }) {
        if (!state) return null;
        return {
          action: "record_inventory_movement",
          payload: {
            item_id: state.match.item_id,
            item_name: state.match.item_name,
            movement_type: "return",
            quantity_delta: state.quantity,
            remarks: state.remarks || "Restored through Telegram semantic inventory flow.",
          },
          request_text: `${userText}\nSemantic intent: restore inventory.`,
        };
      },
    },
    restock: {
      prepare({ operation, userText, inventorySnapshot }) {
        return buildInventoryBatchOperationStates(operation, userText, inventorySnapshot);
      },
      intent: "restock inventory",
      summary: ({ state }) => {
        if (!Array.isArray(state) || state.length === 0) return "Restock inventory.";
        if (state.length === 1) {
          const item = state[0];
          return `Restock ${item.quantity} ${item.match?.unit || item.unit} of ${item.match?.item_name || item.itemName}.`;
        }
        return `Restock ${state.length} inventory items.`;
      },
      buildPrimaryRequest({ userText, state }) {
        if (!Array.isArray(state) || state.length === 0) return null;
        return {
          action: "record_inventory_purchase_batch",
          payload: {
            items: state.map((item) => ({
              item_id: item.match?.item_id || "",
              item_key: slugifyInventoryItemName(item.unitMismatch ? `${item.itemName}_${item.unit}` : item.itemName),
              item_name: item.match?.item_name || item.itemName,
              category: item.match?.category || inferInventoryCategory(item.itemName, userText),
              unit: item.unit,
              quantity: item.quantity,
              expiry_date: item.expiryDate || "",
              remarks: item.remarks || "Restocked through Telegram semantic inventory flow.",
            })),
          },
          request_text: `${userText}\nSemantic intent: restock inventory.`,
        };
      },
    },
  };

  function buildShoppingQueryPlan(operation, userText) {
    return buildQueryPlanFromSpec(operation, userText, QUERY_OPERATION_SPECS.shopping);
  }

  function buildInventoryQueryPlan(operation, userText) {
    return buildQueryPlanFromSpec(operation, userText, QUERY_OPERATION_SPECS.inventory);
  }

  function buildBabyQueryPlan(operation, userText) {
    return buildQueryPlanFromSpec(operation, userText, QUERY_OPERATION_SPECS.baby);
  }

  function buildBabyRecordPlan(operation, userText) {
    return buildMutationPlanFromSpec(operation, userText, RECORD_OPERATION_SPECS.baby);
  }

  function buildTaskCreatePlan(operation, userText) {
    return buildMutationPlanFromSpec(operation, userText, RECORD_OPERATION_SPECS.task);
  }

  function buildTaskQueryPlan(operation, userText) {
    return buildQueryPlanFromSpec(operation, userText, QUERY_OPERATION_SPECS.task);
  }

  function buildFinanceRecordPlan(operation, userText) {
    return buildMutationPlanFromSpec(operation, userText, RECORD_OPERATION_SPECS.finance);
  }

  function buildFinanceQueryPlan(operation, userText) {
    return buildQueryPlanFromSpec(operation, userText, QUERY_OPERATION_SPECS.finance);
  }

  function buildDocumentQueryPlan(operation, userText) {
    return buildQueryPlanFromSpec(operation, userText, QUERY_OPERATION_SPECS.document);
  }

  function buildDocumentCreatePlan(operation, userText) {
    return buildCreatePlanFromSpec(operation, userText, CREATE_OPERATION_SPECS.document);
  }

  function buildPropertyQueryPlan(operation, userText) {
    return buildQueryPlanFromSpec(operation, userText, QUERY_OPERATION_SPECS.property);
  }

  function buildPropertyCreatePlan(operation, userText) {
    return buildCreatePlanFromSpec(operation, userText, CREATE_OPERATION_SPECS.property);
  }

  function buildCaregiverQueryPlan(operation, userText) {
    return buildQueryPlanFromSpec(operation, userText, QUERY_OPERATION_SPECS.caregiver);
  }

  function buildCaregiverCreatePlan(operation, userText) {
    return buildCreatePlanFromSpec(operation, userText, CREATE_OPERATION_SPECS.caregiver);
  }

  function buildAssetQueryPlan(operation, userText) {
    return buildQueryPlanFromSpec(operation, userText, QUERY_OPERATION_SPECS.asset);
  }

  function buildAssetCreatePlan(operation, userText) {
    return buildCreatePlanFromSpec(operation, userText, CREATE_OPERATION_SPECS.asset);
  }

  function buildInventorySetLevelPlan(operation, userText, snapshot) {
    return buildMutationPlanFromSpec(operation, userText, {
      ...INVENTORY_MUTATION_SPECS.set_level,
      prepare(args) {
        return INVENTORY_MUTATION_SPECS.set_level.prepare({ ...args, inventorySnapshot: snapshot });
      },
    });
  }

  function buildInventoryConsumePlan(operation, userText, snapshot) {
    return buildMutationPlanFromSpec(operation, userText, {
      ...INVENTORY_MUTATION_SPECS.consume,
      prepare(args) {
        return INVENTORY_MUTATION_SPECS.consume.prepare({ ...args, inventorySnapshot: snapshot });
      },
    });
  }

  function buildInventoryRestorePlan(operation, userText, snapshot) {
    return buildMutationPlanFromSpec(operation, userText, {
      ...INVENTORY_MUTATION_SPECS.restore,
      prepare(args) {
        return INVENTORY_MUTATION_SPECS.restore.prepare({ ...args, inventorySnapshot: snapshot });
      },
    });
  }

  function buildInventoryRestockPlan(operation, userText, snapshot) {
    return buildMutationPlanFromSpec(operation, userText, {
      ...INVENTORY_MUTATION_SPECS.restock,
      prepare(args) {
        return INVENTORY_MUTATION_SPECS.restock.prepare({ ...args, inventorySnapshot: snapshot });
      },
    });
  }

  const handlers = {
    "shopping:query": buildShoppingQueryPlan,
    "inventory:query": buildInventoryQueryPlan,
    "inventory:set_level": buildInventorySetLevelPlan,
    "inventory:consume": buildInventoryConsumePlan,
    "inventory:restore": buildInventoryRestorePlan,
    "inventory:restock": buildInventoryRestockPlan,
    "baby:query": buildBabyQueryPlan,
    "baby:record": buildBabyRecordPlan,
    "task:create": buildTaskCreatePlan,
    "task:query": buildTaskQueryPlan,
    "finance:record": buildFinanceRecordPlan,
    "finance:query": buildFinanceQueryPlan,
    "document:query": buildDocumentQueryPlan,
    "document:create": buildDocumentCreatePlan,
    "property:query": buildPropertyQueryPlan,
    "property:create": buildPropertyCreatePlan,
    "caregiver:query": buildCaregiverQueryPlan,
    "caregiver:create": buildCaregiverCreatePlan,
    "asset:query": buildAssetQueryPlan,
    "asset:create": buildAssetCreatePlan,
  };

  function getSemanticOperationHandler(entity, action) {
    return handlers[semanticOperationKey(entity, action)] || null;
  }

  return {
    buildSemanticOperationPlan,
    semanticOperationKey,
  };
}
