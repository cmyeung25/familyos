import fs from "node:fs/promises";
import path from "node:path";
import { Workbook, SpreadsheetFile } from "@oai/artifact-tool";

const OUT = path.resolve("output");
const PREVIEWS = path.join(OUT, "previews");
await fs.mkdir(PREVIEWS, { recursive: true });

const wb = Workbook.create();
const colors = {
  navy: "#1F4E78", paleBlue: "#D9EAF7", canvas: "#F7FBFE",
  input: "#0000FF", formula: "#000000", green: "#E2F0D9",
  amber: "#FFF2CC", red: "#FCE4D6",
};
const tabs = [
  "dashboard", "guide", "households", "people", "tasks",
  "task_context_hints",
  "finance_transactions", "finance_budgets", "asset_accounts", "asset_snapshots",
  "inventory_items", "inventory_movements", "baby_log", "caregivers",
  "caregiver_records", "properties", "property_scenarios", "documents",
  "lookup_values", "system_settings", "audit_log", "checks", "dashboard_helpers",
];
const ws = Object.fromEntries(tabs.map((name) => [name, wb.worksheets.add(name)]));
for (const sheet of Object.values(ws)) sheet.showGridLines = false;

// artifact-tool serializes Date values from UTC fields, so store Hong Kong wall time.
const now = new Date(Date.now() + 8 * 60 * 60 * 1000);
const c = (n) => {
  let out = "";
  while (n) {
    const r = (n - 1) % 26;
    out = String.fromCharCode(65 + r) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
};
const h = (text) => text.split(",");
const matrix = (headers, rows) => rows.map((row) => headers.map((key) => row[key] ?? ""));
const col = (headers, key) => c(headers.indexOf(key) + 1);
const rng = (headers, key, end) => `${col(headers, key)}2:${col(headers, key)}${end}`;

function styleHeader(sheet, last) {
  const range = sheet.getRange(`A1:${last}1`);
  range.format.fill = colors.navy;
  range.format.font = { bold: true, color: "#FFFFFF" };
  range.format.wrapText = true;
  range.format.rowHeight = 30;
}

function addFormula(sheet, headers, end, key, formula) {
  const letter = col(headers, key);
  sheet.getRange(`${letter}2`).formulas = [[formula]];
  sheet.getRange(`${letter}2:${letter}${end}`).fillDown();
}

function applyValidation(sheet, headers, end, key, values) {
  sheet.getRange(rng(headers, key, end)).dataValidation = {
    rule: Array.isArray(values) ? { type: "list", values } : { type: "list", formula1: values },
  };
}

function formatSheet(sheet, headers, end, formulas, widths = {}) {
  sheet.getRange(`A2:${c(headers.length)}${end}`).format.font = { color: colors.input };
  for (const key of headers) {
    const letter = col(headers, key);
    const cells = sheet.getRange(`${letter}2:${letter}${end}`);
    if (
      key.endsWith("_at") || ["due_at", "event_at", "start_at", "end_at", "started_at", "ended_at", "last_movement_at"].includes(key)
    ) cells.format.numberFormat = "yyyy-mm-dd hh:mm";
    if (
      key.endsWith("_date") || key === "date_of_birth" || key === "active_from" || key === "active_to" ||
      key === "month_start" || key === "as_of_date" || key === "expiry_date" || key === "next_expiry_date"
    ) cells.format.numberFormat = "yyyy-mm-dd";
    if (key.endsWith("_hkd") || ["amount", "asset_value", "liability_amount", "net_value", "price_per_sqft"].includes(key)) {
      cells.format.numberFormat = '"HK$"#,##0.00;[Red]("HK$"#,##0.00);-';
    }
    if (key.endsWith("_pct") || key.endsWith("_rate")) cells.format.numberFormat = "0.0%";
    cells.format.columnWidth = widths[key] ?? (
      key.includes("description") || key.includes("remarks") || key.includes("notes") ||
      ["work_scope", "pros", "cons", "request_text", "before_json", "after_json", "changed_fields_json"].includes(key) ? 30 :
      key.endsWith("_id") ? 18 :
      key.endsWith("_at") || key.endsWith("_date") ? 17 :
      15
    );
  }
  for (const key of Object.keys(formulas)) sheet.getRange(rng(headers, key, end)).format.font = { color: colors.formula };
}

function addTable(def) {
  const sheet = ws[def.name];
  const headers = def.headers;
  const end = def.end ?? 301;
  const last = c(headers.length);
  sheet.getRange(`A1:${last}1`).values = [headers];
  if (def.rows?.length) sheet.getRange(`A2:${last}${def.rows.length + 1}`).values = matrix(headers, def.rows);
  for (const [key, formula] of Object.entries(def.formulas ?? {})) addFormula(sheet, headers, end, key, formula);
  styleHeader(sheet, last);
  formatSheet(sheet, headers, end, def.formulas ?? {}, def.widths);
  for (const [key, values] of Object.entries(def.validations ?? {})) applyValidation(sheet, headers, end, key, values);
  sheet.freezePanes.freezeRows(1);
  const table = sheet.tables.add(`A1:${last}${end}`, true, def.table);
  table.style = "TableStyleMedium2";
  table.showFilterButton = true;
}

const vocab = {
  person_role: ["husband", "wife", "baby", "helper", "confinement_nanny"],
  record_status: ["active", "inactive", "archived"],
  task_category: ["baby", "finance", "home", "helper", "medical", "property", "pet", "document"],
  task_priority: ["low", "medium", "high", "urgent"],
  task_status: ["open", "in_progress", "waiting", "done", "cancelled"],
  recurrence: ["none", "daily", "weekly", "monthly", "quarterly", "yearly", "custom"],
  finance_type: ["income", "expense", "transfer"],
  finance_category: ["salary", "bonus", "rent", "household", "groceries", "baby", "helper", "confinement_nanny", "medical", "pet", "utilities", "transport", "insurance", "tax", "property", "savings", "investment", "leisure", "other"],
  currency: ["HKD", "USD", "CNY", "JPY", "GBP", "EUR"],
  payment_method: ["cash", "credit_card", "debit_card", "fps", "autopay", "bank_transfer", "other"],
  ledger_status: ["posted", "void"],
  asset_type: ["cash", "bank_deposit", "stocks", "etf", "mpf", "insurance_cash_value", "other_asset", "liability"],
  liquidity_class: ["cash", "liquid", "investment", "retirement", "non_liquid"],
  inventory_category: ["baby_feeding", "baby_diaper", "household_cleaning", "personal_care", "medicine", "pet_food", "pet_litter", "groceries", "other"],
  inventory_unit: ["piece", "pack", "box", "bottle", "can", "kg", "g", "ml"],
  movement_type: ["purchase", "consume", "adjustment_in", "adjustment_out", "discard", "return"],
  baby_log_type: ["vaccination", "clinic_visit", "doctor_visit", "weight", "height", "feeding", "sleep", "diaper", "temperature", "symptom", "medicine", "supplies", "note"],
  caregiver_type: ["helper", "confinement_nanny"],
  caregiver_record_type: ["leave", "schedule", "training", "house_rule", "handover", "reminder", "payment_note"],
  property_status: ["researched", "to_visit", "visited", "shortlisted", "rejected", "offer_consideration", "archived"],
  scenario_status: ["draft", "review", "shortlisted", "rejected", "archived"],
  document_category: ["birth_certificate", "identity_document", "marriage_certificate", "lease", "insurance", "helper_contract", "medical", "bank", "tax", "other"],
  document_status: ["active", "expired", "renewed", "archived"],
  actor_type: ["manual", "codex", "bot", "system"],
  audit_operation: ["append", "update", "void"],
  audit_result: ["success", "failed"],
  yes_no: ["TRUE", "FALSE"],
};
const lookupRows = [];
const ranges = {};
let lookupRow = 2;
for (const [list, values] of Object.entries(vocab)) {
  const first = lookupRow;
  for (let i = 0; i < values.length; i += 1) {
    lookupRows.push({ list_key: list, value: values[i], display_label: values[i], sort_order: i + 1, active: true });
    lookupRow += 1;
  }
  ranges[list] = `lookup_values!$B$${first}:$B$${lookupRow - 1}`;
}
const L = (name) => ranges[name];

addTable({
  name: "lookup_values", table: "LookupValuesTable", end: lookupRows.length + 10,
  headers: h("list_key,value,display_label,sort_order,active"), rows: lookupRows,
  widths: { list_key: 26, value: 24, display_label: 24 },
});
addTable({
  name: "system_settings", table: "SystemSettingsTable", end: 30,
  headers: h("setting_key,setting_value,value_type,description,updated_at"),
  rows: [
    ["inventory_expiry_warning_days", 30, "number", "庫存接近到期提醒日數"],
    ["document_expiry_warning_days", 60, "number", "文件到期提醒日數"],
    ["caregiver_contract_warning_days", 60, "number", "工人或陪月合約提醒日數"],
    ["task_lookahead_days", 7, "number", "短期事項預覽日數"],
    ["baby_important_date_lookahead_days", 14, "number", "BB 重要日期預覽日數"],
    ["property_cash_buffer_months", 6, "number", "置業後建議保留現金月數"],
  ].map(([setting_key, setting_value, value_type, description]) => ({ setting_key, setting_value, value_type, description, updated_at: now })),
  widths: { setting_key: 34, description: 34 },
});

const HH = ["hh_home"];
const PEOPLE = "people!$A$2:$A$101";
const ITEMS = "inventory_items!$A$2:$A$301";
const TASKS = "tasks!$A$2:$A$501";
const PROPERTIES = "properties!$A$2:$A$301";
const ACCOUNTS = "asset_accounts!$A$2:$A$301";
const CAREGIVERS = "caregivers!$A$2:$A$101";
const TX = "finance_transactions!$A$2:$A$1001";

const defs = [
  {
    name: "households", table: "HouseholdsTable", end: 10,
    headers: h("household_id,household_name,base_currency,timezone,schema_version,created_at,updated_at,created_by,updated_by,remarks"),
    rows: [{ household_id: "hh_home", household_name: "屋企", base_currency: "HKD", timezone: "Asia/Hong_Kong", schema_version: "family_os_poc_v1", created_at: now, updated_at: now, created_by: "codex", updated_by: "codex", remarks: "Family OS POC 單一家庭資料來源" }],
    validations: { base_currency: L("currency") },
  },
  {
    name: "people", table: "PeopleTable", end: 101,
    headers: h("person_id,household_id,display_name,role,telegram_user_id,date_of_birth,active_from,active_to,status,created_at,updated_at,created_by,updated_by,remarks"),
    rows: [
      ["per_husband", "丈夫", "husband", ""], ["per_wife", "太太", "wife", ""],
      ["per_baby", "BB", "baby", "請補回出生日期"], ["per_helper", "工人姐姐", "helper", ""],
      ["per_confinement_nanny", "陪月", "confinement_nanny", ""],
    ].map(([person_id, display_name, role, remarks]) => ({ person_id, household_id: "hh_home", display_name, role, telegram_user_id: "", status: "active", created_at: now, updated_at: now, created_by: "codex", updated_by: "codex", remarks })),
    validations: { household_id: HH, role: L("person_role"), status: L("record_status") },
  },
  {
    name: "tasks", table: "TasksTable", end: 501,
    headers: h("task_id,household_id,category,task_name,description,owner_person_id,due_at,priority,status,recurrence,recurrence_notes,related_person_id,related_item_id,source_type,source_id,completed_at,is_overdue,created_at,updated_at,created_by,updated_by,remarks"),
    formulas: { is_overdue: '=AND(A2<>"",I2<>"done",I2<>"cancelled",G2<>"",G2<NOW())' },
    validations: { household_id: HH, category: L("task_category"), owner_person_id: PEOPLE, priority: L("task_priority"), status: L("task_status"), recurrence: L("recurrence"), related_person_id: PEOPLE, related_item_id: ITEMS },
  },
  {
    name: "task_context_hints", table: "TaskContextHintsTable", end: 301,
    headers: h("hint_id,household_id,status,hint_text,applies_to_category,applies_to_keywords,applies_to_related_person_id,applies_to_owner_person_id,applies_to_location_keywords,priority,valid_from,valid_to,created_at,updated_at,created_by,updated_by,remarks"),
    validations: {
      household_id: HH,
      status: L("record_status"),
      applies_to_category: L("task_category"),
      applies_to_related_person_id: PEOPLE,
      applies_to_owner_person_id: PEOPLE,
    },
  },
  {
    name: "finance_transactions", table: "FinanceTransactionsTable", end: 1001,
    headers: h("transaction_id,household_id,transaction_date,month_start,type,category,sub_category,item_name,amount,currency,fx_rate_to_hkd,amount_hkd,payer_person_id,is_recurring,payment_method,related_property_id,status,created_at,updated_at,created_by,updated_by,remarks"),
    formulas: { month_start: '=IF(C2="","",EOMONTH(C2,-1)+1)', amount_hkd: '=IF(OR(I2="",K2=""),"",I2*K2)' },
    validations: { household_id: HH, type: L("finance_type"), category: L("finance_category"), currency: L("currency"), payer_person_id: PEOPLE, is_recurring: L("yes_no"), payment_method: L("payment_method"), related_property_id: PROPERTIES, status: L("ledger_status") },
  },
  {
    name: "finance_budgets", table: "FinanceBudgetsTable",
    headers: h("budget_id,household_id,month_start,category,budget_amount_hkd,owner_person_id,created_at,updated_at,created_by,updated_by,remarks"),
    validations: { household_id: HH, category: L("finance_category"), owner_person_id: PEOPLE },
  },
  {
    name: "asset_accounts", table: "AssetAccountsTable",
    headers: h("asset_account_id,household_id,owner_person_id,asset_type,institution,account_name,currency,liquidity_class,include_in_cash_assets,status,created_at,updated_at,created_by,updated_by,remarks"),
    validations: { household_id: HH, owner_person_id: PEOPLE, asset_type: L("asset_type"), currency: L("currency"), liquidity_class: L("liquidity_class"), include_in_cash_assets: L("yes_no"), status: L("record_status") },
  },
  {
    name: "asset_snapshots", table: "AssetSnapshotsTable", end: 501,
    headers: h("asset_snapshot_id,household_id,as_of_date,asset_account_id,asset_value,liability_amount,net_value,is_latest,cash_asset_value_hkd,created_at,updated_at,created_by,updated_by,remarks"),
    formulas: {
      net_value: '=IF(D2="","",E2-F2)',
      is_latest: '=IF(OR(C2="",D2=""),"",C2=MAXIFS($C$2:$C$501,$D$2:$D$501,D2))',
      cash_asset_value_hkd: '=IF(AND(H2=TRUE,COUNTIFS(asset_accounts!$A$2:$A$301,D2,asset_accounts!$I$2:$I$301,TRUE)>0),G2,0)',
    },
    validations: { household_id: HH, asset_account_id: ACCOUNTS },
  },
  {
    name: "inventory_items", table: "InventoryItemsTable",
    headers: h("item_id,household_id,item_name,category,unit,safety_stock,storage_location,next_expiry_date,preferred_brand,purchase_channel,status,quantity_on_hand,last_movement_at,is_low_stock,is_expiring_soon,needs_restock,created_at,updated_at,created_by,updated_by,remarks"),
    rows: [
      ["itm_diaper", "尿片", "baby_diaper", "piece", "請設定安全庫存"],
      ["itm_formula", "奶粉", "baby_feeding", "can", "如適用，請設定安全庫存"],
      ["itm_baby_wipes", "濕紙巾", "baby_diaper", "pack", "請設定安全庫存"],
      ["itm_toilet_paper", "廁紙", "personal_care", "pack", "請設定安全庫存"],
      ["itm_cleaning", "清潔用品", "household_cleaning", "bottle", "請按需要拆分品項"],
      ["itm_medicine", "常用藥物", "medicine", "box", "只記錄庫存，不取代醫療建議"],
      ["itm_cat_food", "貓糧", "pet_food", "kg", "請設定安全庫存"],
      ["itm_cat_litter", "貓砂", "pet_litter", "kg", "請設定安全庫存"],
    ].map(([item_id, item_name, category, unit, remarks]) => ({ item_id, household_id: "hh_home", item_name, category, unit, status: "active", created_at: now, updated_at: now, created_by: "codex", updated_by: "codex", remarks })),
    formulas: {
      quantity_on_hand: '=IF(A2="","",SUMIFS(inventory_movements!$F$2:$F$1001,inventory_movements!$D$2:$D$1001,A2,inventory_movements!$J$2:$J$1001,"posted"))',
      last_movement_at: '=IF(A2="","",IFERROR(IF(MAXIFS(inventory_movements!$C$2:$C$1001,inventory_movements!$D$2:$D$1001,A2)=0,"",MAXIFS(inventory_movements!$C$2:$C$1001,inventory_movements!$D$2:$D$1001,A2)),""))',
      is_low_stock: '=AND(A2<>"",F2<>"",L2<=F2)',
      is_expiring_soon: '=AND(A2<>"",H2<>"",H2<=TODAY()+VALUE(XLOOKUP("inventory_expiry_warning_days",system_settings!$A$2:$A$30,system_settings!$B$2:$B$30,30)))',
      needs_restock: '=OR(N2,O2)',
    },
    validations: { household_id: HH, category: L("inventory_category"), unit: L("inventory_unit"), status: L("record_status") },
  },
  {
    name: "inventory_movements", table: "InventoryMovementsTable", end: 1001,
    headers: h("movement_id,household_id,event_at,item_id,movement_type,quantity_delta,expiry_date,unit_cost_hkd,related_transaction_id,status,created_at,updated_at,created_by,updated_by,remarks"),
    validations: { household_id: HH, item_id: ITEMS, movement_type: L("movement_type"), related_transaction_id: TX, status: L("ledger_status") },
  },
  {
    name: "baby_log", table: "BabyLogTable", end: 1001,
    headers: h("baby_log_id,household_id,event_at,baby_person_id,log_type,log_subtype,description,value_number,value_text,unit,started_at,ended_at,duration_minutes,baby_age_days,related_task_id,recorded_by_person_id,status,created_at,updated_at,created_by,updated_by,remarks"),
    formulas: {
      duration_minutes: '=IF(OR(K2="",L2=""),"",ROUND((L2-K2)*1440,0))',
      baby_age_days: '=IFERROR(IF(OR(C2="",D2=""),"",INT(C2-XLOOKUP(D2,people!$A$2:$A$101,people!$E$2:$E$101,""))),"")',
    },
    validations: { household_id: HH, baby_person_id: PEOPLE, log_type: L("baby_log_type"), related_task_id: TASKS, recorded_by_person_id: PEOPLE, status: L("record_status") },
  },
  {
    name: "caregivers", table: "CaregiversTable", end: 101,
    headers: h("caregiver_id,household_id,person_id,caregiver_type,start_date,end_date,contract_expiry_date,monthly_cost_hkd,off_day,work_scope,important_notes,days_to_contract_end,created_at,updated_at,created_by,updated_by,remarks"),
    rows: [
      ["cgv_helper", "per_helper", "helper", "請補回合約及休息日資料"],
      ["cgv_confinement_nanny", "per_confinement_nanny", "confinement_nanny", "請補回陪月期間及工作時間"],
    ].map(([caregiver_id, person_id, caregiver_type, remarks]) => ({ caregiver_id, household_id: "hh_home", person_id, caregiver_type, created_at: now, updated_at: now, created_by: "codex", updated_by: "codex", remarks })),
    formulas: { days_to_contract_end: '=IF(G2="","",G2-TODAY())' },
    validations: { household_id: HH, person_id: PEOPLE, caregiver_type: L("caregiver_type") },
  },
  {
    name: "caregiver_records", table: "CaregiverRecordsTable",
    headers: h("caregiver_record_id,household_id,caregiver_id,record_type,start_at,end_at,title,description,status,related_task_id,created_at,updated_at,created_by,updated_by,remarks"),
    validations: { household_id: HH, caregiver_id: CAREGIVERS, record_type: L("caregiver_record_type"), status: L("record_status"), related_task_id: TASKS },
  },
  {
    name: "properties", table: "PropertiesTable",
    headers: h("property_id,household_id,visit_date,estate_name,district,address_or_block,flat_type,saleable_area_sqft,bedrooms,asking_price_hkd,price_per_sqft,transport_score,family_distance_score,baby_convenience_score,pros,cons,status,source_url,created_at,updated_at,created_by,updated_by,remarks"),
    formulas: { price_per_sqft: '=IF(OR(H2="",J2=""),"",J2/H2)' },
    validations: { household_id: HH, status: L("property_status") },
  },
  {
    name: "property_scenarios", table: "PropertyScenariosTable",
    headers: h("scenario_id,household_id,property_id,scenario_name,purchase_price_hkd,down_payment_pct,down_payment_hkd,mortgage_amount_hkd,mortgage_term_years,annual_interest_rate,stress_interest_rate,monthly_payment_hkd,stress_monthly_payment_hkd,estimated_upfront_cost_hkd,total_upfront_cash_hkd,current_cash_assets_hkd,remaining_cash_after_purchase_hkd,monthly_income_hkd,monthly_expense_hkd,monthly_buffer_after_mortgage_hkd,payment_to_income_pct,status,created_at,updated_at,created_by,updated_by,remarks"),
    formulas: {
      down_payment_hkd: '=IF(OR(E2="",F2=""),"",E2*F2)', mortgage_amount_hkd: '=IF(OR(E2="",G2=""),"",E2-G2)',
      monthly_payment_hkd: '=IF(OR(H2="",I2="",J2=""),"",-PMT(J2/12,I2*12,H2))',
      stress_monthly_payment_hkd: '=IF(OR(H2="",I2="",K2=""),"",-PMT(K2/12,I2*12,H2))',
      total_upfront_cash_hkd: '=IF(OR(G2="",N2=""),"",G2+N2)', current_cash_assets_hkd: '=IF(A2="","",dashboard!$M$6)',
      remaining_cash_after_purchase_hkd: '=IF(OR(P2="",O2=""),"",P2-O2)', monthly_income_hkd: '=IF(A2="","",dashboard!$A$6)',
      monthly_expense_hkd: '=IF(A2="","",dashboard!$E$6)', monthly_buffer_after_mortgage_hkd: '=IF(OR(R2="",S2="",M2=""),"",R2-S2-M2)',
      payment_to_income_pct: '=IF(OR(M2="",R2=""),"",M2/R2)',
    },
    validations: { household_id: HH, property_id: PROPERTIES, status: L("scenario_status") },
  },
  {
    name: "documents", table: "DocumentsTable",
    headers: h("document_id,household_id,document_name,category,owner_person_id,storage_location,issue_date,expiry_date,renewal_required,related_task_id,status,days_to_expiry,is_expiring_soon,created_at,updated_at,created_by,updated_by,remarks"),
    formulas: {
      days_to_expiry: '=IF(H2="","",H2-TODAY())',
      is_expiring_soon: '=AND(A2<>"",I2=TRUE,H2<>"",H2<=TODAY()+VALUE(XLOOKUP("document_expiry_warning_days",system_settings!$A$2:$A$30,system_settings!$B$2:$B$30,60)))',
    },
    validations: { household_id: HH, category: L("document_category"), owner_person_id: PEOPLE, renewal_required: L("yes_no"), related_task_id: TASKS, status: L("document_status") },
  },
  {
    name: "audit_log", table: "AuditLogTable", end: 1001,
    headers: h("audit_id,household_id,changed_at,actor_type,actor_id,source,sheet_name,record_id,operation,changed_fields_json,before_json,after_json,request_text,result_status,created_at"),
    validations: { household_id: HH, actor_type: L("actor_type"), operation: L("audit_operation"), result_status: L("audit_result") },
  },
];
for (const def of defs) addTable(def);

ws.tasks.getRange("Q2:Q501").conditionalFormats.addCustom("=$Q2=TRUE", { fill: colors.red, font: { color: "#9C0006", bold: true } });
ws.inventory_items.getRange("P2:P301").conditionalFormats.addCustom("=$P2=TRUE", { fill: colors.amber, font: { color: "#9C6500", bold: true } });
ws.documents.getRange("M2:M301").conditionalFormats.addCustom("=$M2=TRUE", { fill: colors.amber, font: { color: "#9C6500", bold: true } });

const guide = ws.guide;
guide.getRange("A1:F1").merge();
guide.getRange("A1").values = [["Family OS Google Sheets POC 使用指南"]];
guide.getRange("A1:F1").format.fill = colors.navy;
guide.getRange("A1:F1").format.font = { bold: true, color: "#FFFFFF", size: 16 };
guide.getRange("A3:C3").values = [["項目", "規則", "說明"]];
styleHeader(guide, "C");
guide.getRange("A4:C18").values = [
  ["schema_version", "family_os_poc_v1", "LLM 寫入前必須確認 households.schema_version。"],
  ["時區", "Asia/Hong_Kong", "日期時間顯示為 yyyy-mm-dd hh:mm。"],
  ["家庭識別", "hh_home", "POC 使用單一 household_id，日後可搬到 database。"],
  ["流水資料", "只新增", "財務、資產快照、庫存增減、BB 紀錄及 audit_log 不直接覆寫。"],
  ["主資料", "按 ID 修改", "tasks、庫存品項、照顧者紀錄、樓盤、置業情景及文件可更新。"],
  ["公式欄", "禁止覆寫", "黑色字由公式計算；藍色字供人工或 LLM 輸入。"],
  ["審計", "LLM 必須追加 audit_log", "記錄操作、修改前後 JSON、原始要求及結果。"],
  ["文件", "只存 metadata", "不要放身份證號碼、銀行密碼或文件內容。"],
  ["庫存", "用 movements 更新", "補貨輸入正數；消耗、棄置輸入負數。"],
  ["BB 紀錄", "以事件追加", "健康、餵奶、睡眠、尿片及病徵共用 baby_log。"],
  ["置業模型", "輕量情景", "只作家庭規劃估算，不視作按揭或財務建議。"],
  ["Dashboard", "只讀", "由其他 tabs 自動計算；如數字異常，先檢查 checks。"],
  ["人工修改", "保留版本", "Google Sheets version history 為人工修改追溯來源。"],
  ["未來 Bot", "固定操作", "query_records、append_record、update_record、record_inventory_movement、record_baby_event、get_dashboard_snapshot、run_property_scenario。"],
  ["開始使用", "先補資料", "補 BB 出生日期、工人合約、資產帳戶、安全庫存及本月收支。"],
];
guide.getRange("A4:C18").format.fill = colors.canvas;
guide.getRange("A3:C18").format.wrapText = true;
guide.getRange("A1:A18").format.columnWidth = 22;
guide.getRange("B1:B18").format.columnWidth = 24;
guide.getRange("C1:C18").format.columnWidth = 78;
guide.freezePanes.freezeRows(3);

const helper = ws.dashboard_helpers;
helper.getRange("A1:D7").values = [["月份", "收入", "支出", "淨現金流"], ...Array.from({ length: 6 }, () => ["", "", "", ""])];
for (let row = 2; row <= 7; row += 1) {
  const offset = row - 8;
  helper.getRange(`A${row}`).formulas = [[`=TEXT(EOMONTH(TODAY(),${offset})+1,"yyyy-mm")`]];
  helper.getRange(`B${row}`).formulas = [[`=SUMIFS(finance_transactions!$L$2:$L$1001,finance_transactions!$E$2:$E$1001,"income",finance_transactions!$Q$2:$Q$1001,"posted",finance_transactions!$C$2:$C$1001,">="&DATEVALUE(A${row}&"-01"),finance_transactions!$C$2:$C$1001,"<"&EDATE(DATEVALUE(A${row}&"-01"),1))`]];
  helper.getRange(`C${row}`).formulas = [[`=SUMIFS(finance_transactions!$L$2:$L$1001,finance_transactions!$E$2:$E$1001,"expense",finance_transactions!$Q$2:$Q$1001,"posted",finance_transactions!$C$2:$C$1001,">="&DATEVALUE(A${row}&"-01"),finance_transactions!$C$2:$C$1001,"<"&EDATE(DATEVALUE(A${row}&"-01"),1))`]];
  helper.getRange(`D${row}`).formulas = [[`=B${row}-C${row}`]];
}
const expenseCategories = vocab.finance_category.filter((x) => !["salary", "bonus"].includes(x));
helper.getRange(`F1:G${expenseCategories.length + 1}`).values = [["支出分類", "本月支出"], ...expenseCategories.map((x) => [x, ""])];
for (let row = 2; row <= expenseCategories.length + 1; row += 1) {
  helper.getRange(`G${row}`).formulas = [[`=SUMIFS(finance_transactions!$L$2:$L$1001,finance_transactions!$E$2:$E$1001,"expense",finance_transactions!$Q$2:$Q$1001,"posted",finance_transactions!$F$2:$F$1001,F${row},finance_transactions!$C$2:$C$1001,">="&EOMONTH(TODAY(),-1)+1,finance_transactions!$C$2:$C$1001,"<"&EOMONTH(TODAY(),0)+1)`]];
}
styleHeader(helper, "G");
helper.getRange("B2:D7").format.numberFormat = '"HK$"#,##0;[Red]("HK$"#,##0);-';
helper.getRange(`G2:G${expenseCategories.length + 1}`).format.numberFormat = '"HK$"#,##0;[Red]("HK$"#,##0);-';

const dash = ws.dashboard;
dash.getRange("A1:W1").merge();
dash.getRange("A1").values = [["Family OS 家庭總覽"]];
dash.getRange("A1:W1").format.fill = colors.navy;
dash.getRange("A1:W1").format.font = { bold: true, color: "#FFFFFF", size: 18 };
dash.getRange("A3:B3").values = [["月份", ""]];
dash.getRange("B3").formulas = [['=TEXT(TODAY(),"yyyy-mm")']];
dash.getRange("D3:J3").merge();
dash.getRange("D3").values = [["資料來源：Family OS POC v1 | 時區：Asia/Hong_Kong"]];
dash.getRange("D3:J3").format.font = { italic: true, color: "#5B6573" };
function card(titleRange, valueRange, title, formula, fill = colors.paleBlue) {
  dash.getRange(titleRange).merge();
  dash.getRange(valueRange).merge();
  dash.getRange(titleRange.split(":")[0]).values = [[title]];
  dash.getRange(valueRange.split(":")[0]).formulas = [[formula]];
  dash.getRange(titleRange).format.fill = colors.navy;
  dash.getRange(titleRange).format.font = { bold: true, color: "#FFFFFF" };
  dash.getRange(valueRange).format.fill = fill;
  dash.getRange(valueRange).format.font = { bold: true, color: "#1F2937", size: 15 };
}
card("A5:C5", "A6:C7", "本月收入", '=SUMIFS(finance_transactions!$L$2:$L$1001,finance_transactions!$E$2:$E$1001,"income",finance_transactions!$Q$2:$Q$1001,"posted",finance_transactions!$C$2:$C$1001,">="&EOMONTH(TODAY(),-1)+1,finance_transactions!$C$2:$C$1001,"<"&EOMONTH(TODAY(),0)+1)', colors.green);
card("E5:G5", "E6:G7", "本月支出", '=SUMIFS(finance_transactions!$L$2:$L$1001,finance_transactions!$E$2:$E$1001,"expense",finance_transactions!$Q$2:$Q$1001,"posted",finance_transactions!$C$2:$C$1001,">="&EOMONTH(TODAY(),-1)+1,finance_transactions!$C$2:$C$1001,"<"&EOMONTH(TODAY(),0)+1)', colors.amber);
card("I5:K5", "I6:K7", "本月儲蓄", "=A6-E6", colors.green);
card("M5:O5", "M6:O7", "現金資產", "=SUM(asset_snapshots!$I$2:$I$501)");
card("Q5:S5", "Q6:S7", "本月待辦", '=COUNTIFS(tasks!$A$2:$A$501,"<>",tasks!$I$2:$I$501,"<>done",tasks!$I$2:$I$501,"<>cancelled",tasks!$G$2:$G$501,">="&EOMONTH(TODAY(),-1)+1,tasks!$G$2:$G$501,"<"&EOMONTH(TODAY(),0)+1)');
card("A9:C9", "A10:C11", "逾期事項", '=COUNTIF(tasks!$Q$2:$Q$501,TRUE)', colors.red);
card("E9:G9", "E10:G11", "低庫存物品", '=COUNTIF(inventory_items!$N$2:$N$301,TRUE)', colors.amber);
card("I9:K9", "I10:K11", "BB 重要日期", '=COUNTIFS(tasks!$C$2:$C$501,"baby",tasks!$I$2:$I$501,"<>done",tasks!$I$2:$I$501,"<>cancelled",tasks!$G$2:$G$501,">="&TODAY(),tasks!$G$2:$G$501,"<="&TODAY()+VALUE(XLOOKUP("baby_important_date_lookahead_days",system_settings!$A$2:$A$30,system_settings!$B$2:$B$30,14)))');
card("M9:O9", "M10:O11", "工人相關提醒", '=COUNTIFS(tasks!$C$2:$C$501,"helper",tasks!$I$2:$I$501,"<>done",tasks!$I$2:$I$501,"<>cancelled",tasks!$G$2:$G$501,">="&TODAY(),tasks!$G$2:$G$501,"<="&TODAY()+60)+COUNTIFS(caregivers!$G$2:$G$101,">="&TODAY(),caregivers!$G$2:$G$101,"<="&TODAY()+60)');
card("Q9:S9", "Q10:S11", "租約 / 置業提醒", '=COUNTIFS(documents!$D$2:$D$301,"lease",documents!$M$2:$M$301,TRUE)+COUNTIFS(tasks!$C$2:$C$501,"property",tasks!$I$2:$I$501,"<>done",tasks!$I$2:$I$501,"<>cancelled",tasks!$G$2:$G$501,">="&TODAY(),tasks!$G$2:$G$501,"<="&TODAY()+7)');
card("U9:W9", "U10:W11", "快到期文件", '=COUNTIF(documents!$M$2:$M$301,TRUE)', colors.amber);
dash.getRange("A6:O7").format.numberFormat = '"HK$"#,##0;[Red]("HK$"#,##0);-';
dash.getRange("A14:W14").merge();
dash.getRange("A14").values = [["趨勢與支出分類"]];
dash.getRange("A14:W14").format.fill = colors.navy;
dash.getRange("A14:W14").format.font = { bold: true, color: "#FFFFFF" };
const trend = dash.charts.add("line", helper.getRange("A1:D7"));
trend.setPosition("A16", "K31");
trend.title = "最近六個月收入、支出及淨現金流";
trend.hasLegend = true;
trend.xAxis = { axisType: "textAxis" };
trend.yAxis = { numberFormatCode: '"HK$"#,##0' };
const expense = dash.charts.add("bar", helper.getRange(`F1:G${expenseCategories.length + 1}`));
expense.setPosition("M16", "W31");
expense.title = "本月支出分類";
expense.hasLegend = false;
dash.getRange("A33:W33").merge();
dash.getRange("A33").values = [["使用提示"]];
dash.getRange("A33:W33").format.fill = colors.navy;
dash.getRange("A33:W33").format.font = { bold: true, color: "#FFFFFF" };
dash.getRange("A34:W37").merge();
dash.getRange("A34").values = [["先在 people 補回 BB 出生日期，再設定安全庫存、工人合約及資產帳戶。收入支出請填正數並用 type 區分；庫存請新增 inventory_movements，不要直接修改 quantity_on_hand。LLM 寫入必須追加 audit_log。詳細規則見 guide。"]];
dash.getRange("A34:W37").format.fill = colors.canvas;
dash.getRange("A34:W37").format.wrapText = true;
dash.getRange("A39:W39").merge();
dash.getRange("A39").values = [["家庭庫存盤點"]];
dash.getRange("A39:W39").format.fill = colors.navy;
dash.getRange("A39:W39").format.font = { bold: true, color: "#FFFFFF" };
dash.getRange("A41:E41").values = [["品項", "分類", "現有庫存", "單位", "狀態"]];
dash.getRange("A41:E41").format.fill = colors.navy;
dash.getRange("A41:E41").format.font = { bold: true, color: "#FFFFFF" };
dash.getRange("A42").formulas = [['=IFERROR(FILTER({inventory_items!C2:C301,inventory_items!D2:D301,inventory_items!L2:L301,inventory_items!E2:E301,IF(inventory_items!N2:N301,"低庫存",IF(inventory_items!O2:O301,"接近到期","正常"))},inventory_items!A2:A301<>""),"未有庫存品項")']];
dash.getRange("A42:E341").format.fill = colors.canvas;
dash.getRange("G41:J41").merge();
dash.getRange("G41").values = [["盤點摘要"]];
dash.getRange("G41:J41").format.fill = colors.navy;
dash.getRange("G41:J41").format.font = { bold: true, color: "#FFFFFF" };
dash.getRange("G42:H45").values = [
  ["已登記品項", ""], ["有存貨品項", ""], ["需要補貨", ""], ["未設定安全庫存", ""],
];
dash.getRange("H42:H45").formulas = [
  ['=COUNTIF(inventory_items!A2:A301,"<>")'],
  ['=COUNTIF(inventory_items!L2:L301,">0")'],
  ["=COUNTIF(inventory_items!P2:P301,TRUE)"],
  ['=COUNTIFS(inventory_items!A2:A301,"<>",inventory_items!F2:F301,"")'],
];
dash.getRange("G42:H45").format.fill = colors.paleBlue;
dash.getRange("G47:L49").merge();
dash.getRange("G47").values = [["提示：未設定安全庫存嘅品項唔會觸發低庫存提醒。可以逐步補回 inventory_items 入面嘅 safety_stock。"]];
dash.getRange("G47:L49").format.fill = colors.amber;
dash.getRange("G47:L49").format.wrapText = true;
dash.getRange("E42:E341").conditionalFormats.addCustom('=$E42="低庫存"', { fill: colors.red, font: { color: "#9C0006", bold: true } });
dash.getRange("E42:E341").conditionalFormats.addCustom('=$E42="接近到期"', { fill: colors.amber, font: { color: "#9C6500", bold: true } });
dash.getRange("E42:E341").conditionalFormats.addCustom('=$E42="正常"', { fill: colors.green, font: { color: "#006100", bold: true } });
for (let i = 1; i <= 23; i += 1) dash.getRange(`${c(i)}1:${c(i)}55`).format.columnWidth = 12;
dash.getRange("A1:A55").format.columnWidth = 18;
dash.getRange("B1:B55").format.columnWidth = 22;
dash.getRange("G1:G55").format.columnWidth = 20;
dash.freezePanes.freezeRows(3);

const checks = ws.checks;
checks.getRange("A1:E1").merge();
checks.getRange("A1").values = [["Family OS 資料完整性檢查"]];
checks.getRange("A1:E1").format.fill = colors.navy;
checks.getRange("A1:E1").format.font = { bold: true, color: "#FFFFFF", size: 15 };
checks.getRange("A3:E3").values = [["檢查項目", "實際數量", "預期", "狀態", "處理方法"]];
checks.getRange("A3:E3").format.fill = colors.navy;
checks.getRange("A3:E3").format.font = { bold: true, color: "#FFFFFF" };
const tests = [
  ["tasks 重複 task_id", '=IFERROR(SUMPRODUCT(--(tasks!$A$2:$A$501<>""),--(COUNTIF(tasks!$A$2:$A$501,tasks!$A$2:$A$501)>1)),0)', "刪除或更正重複 ID"],
  ["finance 重複 transaction_id", '=IFERROR(SUMPRODUCT(--(finance_transactions!$A$2:$A$1001<>""),--(COUNTIF(finance_transactions!$A$2:$A$1001,finance_transactions!$A$2:$A$1001)>1)),0)', "刪除或更正重複 ID"],
  ["inventory 重複 item_id", '=IFERROR(SUMPRODUCT(--(inventory_items!$A$2:$A$301<>""),--(COUNTIF(inventory_items!$A$2:$A$301,inventory_items!$A$2:$A$301)>1)),0)', "刪除或更正重複 ID"],
  ["tasks 無效 owner_person_id", '=IFERROR(SUMPRODUCT(--(tasks!$F$2:$F$501<>""),--(COUNTIF(people!$A$2:$A$101,tasks!$F$2:$F$501)=0)),0)', "修正 owner_person_id"],
  ["inventory_movements 無效 item_id", '=IFERROR(SUMPRODUCT(--(inventory_movements!$D$2:$D$1001<>""),--(COUNTIF(inventory_items!$A$2:$A$301,inventory_movements!$D$2:$D$1001)=0)),0)', "修正 movement item_id"],
  ["property_scenarios 無效 property_id", '=IFERROR(SUMPRODUCT(--(property_scenarios!$C$2:$C$301<>""),--(COUNTIF(properties!$A$2:$A$301,property_scenarios!$C$2:$C$301)=0)),0)', "修正 property_id"],
  ["documents 無效 owner_person_id", '=IFERROR(SUMPRODUCT(--(documents!$E$2:$E$301<>""),--(COUNTIF(people!$A$2:$A$101,documents!$E$2:$E$301)=0)),0)', "修正 owner_person_id"],
];
checks.getRange(`A4:E${tests.length + 4}`).values = [...tests.map(([label, , fix]) => [label, "", 0, "", fix]), ["整體狀態", "", 0, "", "優先處理所有 REVIEW"]];
for (let i = 0; i < tests.length; i += 1) {
  const row = i + 4;
  checks.getRange(`B${row}`).formulas = [[tests[i][1]]];
  checks.getRange(`D${row}`).formulas = [[`=IF(B${row}=C${row},"OK","REVIEW")`]];
}
const totalRow = tests.length + 4;
checks.getRange(`B${totalRow}`).formulas = [[`=COUNTIF(D4:D${totalRow - 1},"REVIEW")`]];
checks.getRange(`D${totalRow}`).formulas = [[`=IF(B${totalRow}=0,"OK","REVIEW")`]];
checks.getRange(`A4:E${totalRow}`).format.fill = colors.canvas;
checks.getRange("A1:A12").format.columnWidth = 38;
checks.getRange("B1:D12").format.columnWidth = 15;
checks.getRange("E1:E12").format.columnWidth = 34;
checks.getRange(`D4:D${totalRow}`).conditionalFormats.addCustom('=$D4="OK"', { fill: colors.green, font: { color: "#006100", bold: true } });
checks.getRange(`D4:D${totalRow}`).conditionalFormats.addCustom('=$D4="REVIEW"', { fill: colors.red, font: { color: "#9C0006", bold: true } });

console.log("DASHBOARD_INSPECT");
console.log((await wb.inspect({ kind: "table", range: "dashboard!A1:W50", include: "values,formulas", tableMaxRows: 55, tableMaxCols: 23 })).ndjson);
console.log("CHECKS_INSPECT");
console.log((await wb.inspect({ kind: "table", range: `checks!A1:E${totalRow}`, include: "values,formulas", tableMaxRows: 15, tableMaxCols: 6 })).ndjson);
console.log("FORMULA_ERROR_SCAN");
console.log((await wb.inspect({ kind: "match", searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A", options: { useRegex: true, maxResults: 300 }, summary: "formula scan" })).ndjson);

const previewTargets = {
  dashboard: "A1:W50", guide: "A1:C18", checks: `A1:E${totalRow}`,
  tasks: "A1:V12", finance_transactions: "A1:V12", inventory_items: "A1:U14",
  property_scenarios: "A1:AA12",
};
for (const [sheetName, range] of Object.entries(previewTargets)) {
  const image = await wb.render({ sheetName, range, scale: 1.25 });
  await fs.writeFile(path.join(PREVIEWS, `${sheetName}.png`), new Uint8Array(await image.arrayBuffer()));
}
const file = await SpreadsheetFile.exportXlsx(wb);
const outputPath = path.join(OUT, "family_os_google_sheets_poc.xlsx");
await file.save(outputPath);
console.log(`OUTPUT=${outputPath}`);
