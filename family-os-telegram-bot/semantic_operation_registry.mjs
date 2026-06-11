export function createSemanticOperationBuilder(deps) {
  const {
    normalizeSemanticEntity,
    normalizeSemanticAction,
    normalizeBabyQueryScope,
    normalizeDiaperOutputValue,
    normalizeTaskCategoryHint,
    normalizeTaskPriority,
    normalizeTaskStatus,
    normalizeSemanticTimestamp,
    normalizeFinanceType,
    normalizeFinanceCategoryHint,
    normalizeDocumentCategoryHint,
    normalizePropertyStatus,
    normalizeCaregiverRecordType,
    normalizeSemanticDate,
    findBestInventoryMatch,
    resolveSemanticInventoryUnit,
    inferInventoryCategory,
    slugifyInventoryItemName,
  } = deps;

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
    const itemName = String(operation?.item_name || "").trim();
    const quantity = Number(operation?.quantity);
    const unitHint = String(operation?.unit_hint || "").trim();
    if (!itemName || !Number.isFinite(quantity) || quantity < 0) return null;
    const match = findBestInventoryMatch(snapshot, itemName, unitHint, userText);
    const unit = resolveSemanticInventoryUnit(match, itemName, unitHint, userText);
    const remarks = String(operation?.remarks || "").trim();
    return { itemName, quantity, match, unit, remarks };
  }

  function buildShoppingQueryPlan(operation, userText) {
    return buildPlan(
      operation.entity,
      operation.action,
      "query shopping and restock needs",
      "Look up what the household should buy or restock.",
      {
        action: "get_dashboard_snapshot",
        payload: { month: "2026-06", days: 7 },
        request_text: userText,
      },
    );
  }

  function buildInventoryQueryPlan(operation, userText) {
    const scope = String(operation?.query_scope || "").trim().toLowerCase();
    const isLowStock = scope === "low_stock" || /買|補貨|restock|low/.test(scope);
    return buildPlan(
      operation.entity,
      operation.action,
      isLowStock ? "query low-stock inventory" : "query inventory snapshot",
      isLowStock ? "Look up items that need restock." : "Look up current inventory.",
      {
        action: isLowStock ? "get_low_stock_items" : "get_inventory_snapshot",
        payload: {},
        request_text: userText,
      },
    );
  }

  function buildBabyQueryPlan(operation, userText) {
    const scope = normalizeBabyQueryScope(operation?.log_scope);
    return buildPlan(
      operation.entity,
      operation.action,
      "query recent baby logs",
      "Look up recent baby records.",
      {
        action: "get_recent_baby_logs",
        payload: scope ? { log_type: scope, limit: 5 } : { limit: 5 },
        request_text: userText,
      },
    );
  }

  function buildBabyRecordPlan(operation, userText) {
    const valueNumber = Number(operation?.quantity);
    if (Number.isFinite(valueNumber) && valueNumber > 0) {
      return buildPlan(
        operation.entity,
        operation.action,
        "record baby milk feeding",
        `Record BB milk feeding ${valueNumber} ml.`,
        {
          action: "append_baby_log",
          payload: {
            log_type: "feeding",
            log_subtype: "milk",
            value_number: valueNumber,
            unit: "ml",
            remarks: String(operation?.remarks || "").trim() || "Recorded through Telegram semantic household flow.",
          },
          request_text: userText,
        },
      );
    }

    const output = normalizeDiaperOutputValue(operation?.value_text || "");
    if (!output) return null;
    return buildPlan(
      operation.entity,
      operation.action,
      "record baby diaper change",
      `Record BB diaper change: ${output}.`,
      {
        action: "append_baby_log",
        payload: {
          log_type: "diaper",
          value_text: output,
          description: `BB 換片：${output}`,
          remarks: String(operation?.remarks || "").trim() || "Recorded through Telegram semantic household flow.",
        },
        request_text: userText,
      },
    );
  }

  function buildTaskCreatePlan(operation, userText) {
    const taskName = String(operation?.task_name || operation?.item_name || "").trim();
    if (!taskName) return null;
    return buildPlan(
      operation.entity,
      operation.action,
      "create household reminder task",
      `Create a task reminder for ${taskName}.`,
      {
        action: "append_task",
        payload: {
          category: normalizeTaskCategoryHint(operation?.category_hint, taskName, userText),
          task_name: taskName,
          description: String(operation?.description || "").trim(),
          due_at: normalizeSemanticTimestamp(operation?.due_at),
          priority: normalizeTaskPriority(operation?.priority),
          status: normalizeTaskStatus(operation?.status),
          remarks: String(operation?.remarks || "").trim(),
        },
        request_text: userText,
      },
    );
  }

  function buildTaskQueryPlan(operation, userText) {
    const scope = String(operation?.query_scope || "").trim().toLowerCase();
    if (scope === "overdue") {
      return buildPlan(operation.entity, operation.action, "query overdue tasks", "Look up overdue tasks.", {
        action: "get_overdue_tasks",
        payload: {},
        request_text: userText,
      });
    }
    if (scope === "upcoming" || scope === "today" || scope === "soon") {
      return buildPlan(operation.entity, operation.action, "query upcoming tasks", "Look up upcoming tasks.", {
        action: "get_upcoming_tasks",
        payload: { days: scope === "today" ? 1 : 7 },
        request_text: userText,
      });
    }
    return buildPlan(operation.entity, operation.action, "query tasks", "Look up tasks.", {
      action: "query_tasks",
      payload: { limit: 10 },
      request_text: userText,
    });
  }

  function buildFinanceRecordPlan(operation, userText) {
    const amount = Number(operation?.amount);
    const type = normalizeFinanceType(operation?.type);
    if (!Number.isFinite(amount) || amount <= 0 || !type) return null;
    return buildPlan(
      operation.entity,
      operation.action,
      "record finance transaction",
      `Record a ${type} transaction for ${amount} HKD.`,
      {
        action: "append_finance_transaction",
        payload: {
          transaction_date: "2026-06-04",
          type,
          category: normalizeFinanceCategoryHint(operation?.category_hint, userText),
          item_name: String(operation?.item_name || "").trim(),
          amount,
          currency: "HKD",
          remarks: String(operation?.remarks || "").trim(),
        },
        request_text: userText,
      },
    );
  }

  function buildFinanceQueryPlan(operation, userText) {
    const scope = String(operation?.query_scope || "").trim().toLowerCase();
    const transactions = scope === "transactions";
    return buildPlan(
      operation.entity,
      operation.action,
      transactions ? "query finance transactions" : "query monthly cashflow",
      transactions ? "Look up recent finance transactions." : "Look up the monthly cashflow summary.",
      {
        action: transactions ? "query_finance_transactions" : "get_monthly_cashflow",
        payload: transactions ? { month: "2026-06", limit: 10 } : { month: "2026-06" },
        request_text: userText,
      },
    );
  }

  function buildDocumentQueryPlan(operation, userText) {
    const scope = String(operation?.query_scope || "").trim().toLowerCase();
    const expiring = /expiry|expiring|到期/.test(scope);
    return buildPlan(
      operation.entity,
      operation.action,
      expiring ? "query expiring documents" : "query documents",
      expiring ? "Look up documents that are nearing expiry." : "Look up household documents.",
      {
        action: expiring ? "get_expiring_documents" : "query_documents",
        payload: { limit: 10 },
        request_text: userText,
      },
    );
  }

  function buildDocumentCreatePlan(operation, userText) {
    const documentName = String(operation?.document_name || operation?.item_name || "").trim();
    if (!documentName) return null;
    return buildPlan(
      operation.entity,
      operation.action,
      "record household document",
      `Record household document ${documentName}.`,
      {
        action: "append_document",
        payload: {
          document_name: documentName,
          category: normalizeDocumentCategoryHint(operation?.category_hint, documentName, userText),
          owner_person_id: String(operation?.owner_person_id || "").trim(),
          storage_location: String(operation?.storage_location || "").trim(),
          expiry_date: normalizeSemanticDate(operation?.expiry_date),
          status: "active",
          remarks: String(operation?.remarks || "").trim(),
        },
        request_text: userText,
      },
    );
  }

  function buildPropertyQueryPlan(operation, userText) {
    const scope = String(operation?.query_scope || "").trim().toLowerCase();
    const scenarios = /scenario|budget|afford/.test(scope);
    return buildPlan(
      operation.entity,
      operation.action,
      scenarios ? "query property scenarios" : "query properties",
      scenarios ? "Look up property scenarios." : "Look up property records.",
      {
        action: scenarios ? "query_property_scenarios" : "query_properties",
        payload: { limit: 10 },
        request_text: userText,
      },
    );
  }

  function buildPropertyCreatePlan(operation, userText) {
    const estateName = String(operation?.estate_name || operation?.item_name || "").trim();
    const district = String(operation?.district || "").trim();
    if (!estateName || !district) return null;
    return buildPlan(
      operation.entity,
      operation.action,
      "record property note",
      `Record property ${estateName} in ${district}.`,
      {
        action: "append_property",
        payload: {
          estate_name: estateName,
          district,
          visit_date: normalizeSemanticDate(operation?.visit_date),
          status: normalizePropertyStatus(operation?.status),
          remarks: String(operation?.remarks || operation?.description || "").trim(),
        },
        request_text: userText,
      },
    );
  }

  function buildCaregiverQueryPlan(operation, userText) {
    const scope = String(operation?.query_scope || "").trim().toLowerCase();
    const records = /record|leave|schedule|handover/.test(scope);
    return buildPlan(
      operation.entity,
      operation.action,
      records ? "query caregiver records" : "query caregivers",
      records ? "Look up caregiver records." : "Look up caregivers.",
      {
        action: records ? "query_caregiver_records" : "query_caregivers",
        payload: { limit: 10 },
        request_text: userText,
      },
    );
  }

  function buildCaregiverCreatePlan(operation, userText) {
    const caregiverId = String(operation?.caregiver_id || "").trim();
    const title = String(operation?.title || operation?.task_name || operation?.item_name || "").trim();
    if (!caregiverId || !title) return null;
    return buildPlan(
      operation.entity,
      operation.action,
      "record caregiver note",
      `Record caregiver note for ${caregiverId}.`,
      {
        action: "append_caregiver_record",
        payload: {
          caregiver_id: caregiverId,
          record_type: normalizeCaregiverRecordType(operation?.record_type, userText),
          title,
          description: String(operation?.description || "").trim(),
          start_at: normalizeSemanticTimestamp(operation?.due_at || operation?.as_of_date || ""),
          status: "active",
          remarks: String(operation?.remarks || "").trim(),
        },
        request_text: userText,
      },
    );
  }

  function buildAssetQueryPlan(operation, userText) {
    const scope = String(operation?.query_scope || "").trim().toLowerCase();
    const accounts = /account/.test(scope);
    return buildPlan(
      operation.entity,
      operation.action,
      accounts ? "query asset accounts" : "query asset snapshot",
      accounts ? "Look up asset accounts." : "Look up the latest asset values.",
      {
        action: accounts ? "query_asset_accounts" : "get_latest_asset_values",
        payload: { limit: 10 },
        request_text: userText,
      },
    );
  }

  function buildAssetCreatePlan(operation, userText) {
    const assetAccountId = String(operation?.asset_account_id || "").trim();
    const assetValue = Number(operation?.asset_value);
    const liabilityAmount = operation?.liability_amount === undefined ? "" : Number(operation?.liability_amount);
    if (!assetAccountId || (!Number.isFinite(assetValue) && !Number.isFinite(liabilityAmount))) return null;
    return buildPlan(
      operation.entity,
      operation.action,
      "record asset snapshot",
      `Record asset snapshot for ${assetAccountId}.`,
      {
        action: "append_asset_snapshot",
        payload: {
          asset_account_id: assetAccountId,
          as_of_date: normalizeSemanticDate(operation?.as_of_date) || "2026-06-04",
          asset_value: Number.isFinite(assetValue) ? assetValue : "",
          liability_amount: Number.isFinite(liabilityAmount) ? liabilityAmount : "",
          remarks: String(operation?.remarks || "").trim(),
        },
        request_text: userText,
      },
    );
  }

  function buildInventorySetLevelPlan(operation, userText, snapshot) {
    const state = buildInventoryOperationState(operation, userText, snapshot);
    if (!state) return null;
    const { itemName, quantity, match, unit, remarks } = state;
    if (!match) {
      return buildPlan(
        operation.entity,
        operation.action,
        "set current stock level",
        `Create ${itemName} if needed, then set its current stock level to ${quantity} ${unit}.`,
        {
          action: "upsert_inventory_item",
          payload: {
            item_key: slugifyInventoryItemName(itemName),
            item_name: itemName,
            category: inferInventoryCategory(itemName, userText),
            unit,
            remarks: remarks || "Created through Telegram semantic inventory flow.",
          },
          request_text: `${userText}\nSemantic intent: set current stock level.`,
        },
        [{
          action: "set_inventory_stock_level",
          payload: {
            item_name: itemName,
            unit,
            quantity_on_hand: quantity,
            remarks: remarks || "Set current stock level through Telegram semantic inventory flow.",
          },
          request_text: `${userText}\nSemantic follow-up: set stock level to ${quantity} ${unit}.`,
        }],
      );
    }
    return buildPlan(
      operation.entity,
      operation.action,
      "set current stock level",
      `Set ${match.item_name} current stock level to ${quantity} ${match.unit}.`,
      {
        action: "set_inventory_stock_level",
        payload: {
          item_id: match.item_id,
          item_name: match.item_name,
          unit: match.unit,
          quantity_on_hand: quantity,
          remarks: remarks || "Set current stock level through Telegram semantic inventory flow.",
        },
        request_text: `${userText}\nSemantic intent: set current stock level.`,
      },
    );
  }

  function buildInventoryConsumePlan(operation, userText, snapshot) {
    const state = buildInventoryOperationState(operation, userText, snapshot);
    if (!state?.match) return null;
    return buildPlan(
      operation.entity,
      operation.action,
      "consume inventory",
      `Consume ${state.quantity} ${state.match.unit} of ${state.match.item_name}.`,
      {
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
      },
    );
  }

  function buildInventoryRestorePlan(operation, userText, snapshot) {
    const state = buildInventoryOperationState(operation, userText, snapshot);
    if (!state?.match) return null;
    return buildPlan(
      operation.entity,
      operation.action,
      "restore inventory",
      `Add back ${state.quantity} ${state.match.unit} of ${state.match.item_name}.`,
      {
        action: "record_inventory_movement",
        payload: {
          item_id: state.match.item_id,
          item_name: state.match.item_name,
          movement_type: "return",
          quantity_delta: state.quantity,
          remarks: state.remarks || "Restored through Telegram semantic inventory flow.",
        },
        request_text: `${userText}\nSemantic intent: restore inventory.`,
      },
    );
  }

  function buildInventoryRestockPlan(operation, userText, snapshot) {
    const state = buildInventoryOperationState(operation, userText, snapshot);
    if (!state) return null;
    return buildPlan(
      operation.entity,
      operation.action,
      "restock inventory",
      `Restock ${state.quantity} ${state.match?.unit || state.unit} of ${state.match?.item_name || state.itemName}.`,
      {
        action: "record_inventory_purchase_batch",
        payload: {
          items: [{
            item_id: state.match?.item_id || "",
            item_key: slugifyInventoryItemName(state.itemName),
            item_name: state.match?.item_name || state.itemName,
            category: state.match?.category || inferInventoryCategory(state.itemName, userText),
            unit: state.match?.unit || state.unit,
            quantity: state.quantity,
            remarks: state.remarks || "Restocked through Telegram semantic inventory flow.",
          }],
        },
        request_text: `${userText}\nSemantic intent: restock inventory.`,
      },
    );
  }

  const semanticOperationHandlers = {
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
    return semanticOperationHandlers[semanticOperationKey(entity, action)] || null;
  }

  function buildSemanticOperationPlan(operation, userText, inventorySnapshot) {
    const entity = normalizeSemanticEntity(operation?.entity);
    const action = normalizeSemanticAction(operation?.action);
    if (!entity || !action) return null;
    const normalized = { ...operation, entity, action };
    const handler = getSemanticOperationHandler(entity, action);
    return handler ? handler(normalized, userText, inventorySnapshot) : null;
  }

  return {
    buildSemanticOperationPlan,
  };
}
