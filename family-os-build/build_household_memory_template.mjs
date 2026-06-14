import fs from "node:fs/promises";
import path from "node:path";
import { Workbook, SpreadsheetFile } from "@oai/artifact-tool";

const outDir = path.resolve("output", "household_memory_template");
await fs.mkdir(outDir, { recursive: true });

const workbook = Workbook.create();
const templateSheet = workbook.worksheets.add("household_memory");
const referenceSheet = workbook.worksheets.add("household_memory_reference");

templateSheet.showGridLines = false;
referenceSheet.showGridLines = false;
templateSheet.freezePanes.freezeRows(1);
referenceSheet.freezePanes.freezeRows(2);

const colors = {
  navy: "#1F4E78",
  paleBlue: "#D9EAF7",
  lightBlue: "#EEF6FB",
  green: "#E2F0D9",
  amber: "#FFF2CC",
  red: "#FCE4D6",
  border: "#D9E2F3",
  text: "#1F1F1F",
};

const headers = [
  "memory_id",
  "household_id",
  "memory_type",
  "subject",
  "value_text",
  "location",
  "category",
  "status",
  "owner_person_id",
  "related_person_id",
  "tags",
  "aliases",
  "last_verified_at",
  "confidence",
  "created_at",
  "updated_at",
  "created_by",
  "updated_by",
  "remarks",
];

const fieldNotes = [
  ["memory_id", "Leave blank when creating the sheet. API writes this automatically."],
  ["household_id", "Usually hh_home for the current Family OS workbook."],
  ["memory_type", "Allowed: item_location, fact, preference."],
  ["subject", "Required. The thing, topic, or fact you want to remember."],
  ["value_text", "Short human-readable memory text, for example 放咗喺工具箱."],
  ["location", "Physical location when memory_type is item_location."],
  ["category", "Optional business category or grouping label."],
  ["status", "Allowed: active, moved, archived."],
  ["owner_person_id", "Optional owner / primary person id."],
  ["related_person_id", "Optional related person id."],
  ["tags", "Optional comma-separated tags."],
  ["aliases", "Optional comma-separated aliases or alternate names."],
  ["last_verified_at", "Optional verification timestamp in yyyy-mm-dd hh:mm:ss+08:00."],
  ["confidence", "Allowed: confirmed, inferred, tentative."],
  ["created_at", "Leave blank for schema setup. API writes this automatically."],
  ["updated_at", "Leave blank for schema setup. API writes this automatically."],
  ["created_by", "Leave blank for schema setup. API writes this automatically."],
  ["updated_by", "Leave blank for schema setup. API writes this automatically."],
  ["remarks", "Optional free-text note."],
];

const enumRows = [
  ["Field", "Allowed values", "Notes"],
  ["memory_type", "item_location, fact, preference", "Use item_location for where an item is stored."],
  ["status", "active, moved, archived", "Use active for current valid memory."],
  ["confidence", "confirmed, inferred, tentative", "confirmed is the best default."],
];

const sampleRows = [
  ["memory_type", "subject", "value_text", "location", "status", "confidence", "remarks"],
  ["item_location", "成長椅工具", "放咗喺工具箱", "工具箱", "active", "confirmed", "Typical object location memory"],
  ["fact", "工人姐姐休息日", "通常星期日休息", "", "active", "confirmed", "Reusable household fact"],
  ["preference", "太太紙巾偏好", "鍾意呢隻牌子紙巾", "", "active", "confirmed", "Explicit preference only"],
];

const guidanceRows = [
  ["Step", "What to do"],
  ["1", "In your Google workbook, add a new worksheet named household_memory."],
  ["2", "Copy only the header row from the household_memory sheet in this file into row 1 of Google Sheets."],
  ["3", "If you want a helper note sheet too, also copy household_memory_reference as a separate tab."],
  ["4", "Do not preload fake data rows into the live workbook unless you actually want them stored."],
];

templateSheet.getRange(`A1:${columnLetter(headers.length)}1`).values = [headers];
templateSheet.getRange(`A1:${columnLetter(headers.length)}1`).format = {
  fill: colors.navy,
  font: { bold: true, color: "#FFFFFF" },
  wrapText: true,
  horizontalAlignment: "center",
  verticalAlignment: "center",
  borders: { preset: "all", style: "thin", color: colors.border },
};

templateSheet.getRange(`A2:${columnLetter(headers.length)}200`).format = {
  fill: "#FFFFFF",
  font: { color: colors.text },
  borders: { preset: "all", style: "thin", color: colors.border },
};

const widthMap = {
  memory_id: 16,
  household_id: 14,
  memory_type: 16,
  subject: 22,
  value_text: 26,
  location: 20,
  category: 16,
  status: 12,
  owner_person_id: 18,
  related_person_id: 18,
  tags: 18,
  aliases: 20,
  last_verified_at: 22,
  confidence: 14,
  created_at: 22,
  updated_at: 22,
  created_by: 16,
  updated_by: 16,
  remarks: 28,
};

headers.forEach((header, index) => {
  const colRange = templateSheet.getRange(`${columnLetter(index + 1)}:${columnLetter(index + 1)}`);
  colRange.format.columnWidth = widthMap[header] || 16;
});
templateSheet.getRange("1:1").format.rowHeight = 28;

for (const field of ["last_verified_at", "created_at", "updated_at"]) {
  const idx = headers.indexOf(field) + 1;
  templateSheet.getRange(`${columnLetter(idx)}2:${columnLetter(idx)}200`).format.numberFormat = "yyyy-mm-dd hh:mm:ss";
}

templateSheet.getRange(`C2:C200`).dataValidation = {
  rule: { type: "list", values: ["item_location", "fact", "preference"] },
};
templateSheet.getRange(`H2:H200`).dataValidation = {
  rule: { type: "list", values: ["active", "moved", "archived"] },
};
templateSheet.getRange(`N2:N200`).dataValidation = {
  rule: { type: "list", values: ["confirmed", "inferred", "tentative"] },
};

referenceSheet.getRange("A1:C1").merge();
referenceSheet.getRange("A1").values = [["Family OS household_memory reference"]];
referenceSheet.getRange("A1:C1").format = {
  fill: colors.navy,
  font: { bold: true, color: "#FFFFFF", size: 14 },
  horizontalAlignment: "left",
  verticalAlignment: "center",
};
referenceSheet.getRange("A2:B20").values = fieldNotes;
referenceSheet.getRange("D2:F5").values = enumRows;
referenceSheet.getRange("D7:J10").values = sampleRows;
referenceSheet.getRange("L2:M6").values = guidanceRows;

for (const range of ["A2:B20", "D2:F5", "D7:J10", "L2:M6"]) {
  const headerRow = range.split(":")[0].replace(/\d+$/, "");
  const startRow = Number(range.match(/\d+/)?.[0] || "1");
  const endCell = range.split(":")[1];
  const endRow = Number(endCell.match(/\d+/)?.[0] || "1");
  const endCol = endCell.replace(/\d+/g, "");
  referenceSheet.getRange(`${headerRow}${startRow}:${endCol}${startRow}`).format = {
    fill: colors.paleBlue,
    font: { bold: true, color: colors.text },
    borders: { preset: "all", style: "thin", color: colors.border },
  };
  if (endRow > startRow) {
    referenceSheet.getRange(`${headerRow}${startRow + 1}:${endCol}${endRow}`).format = {
      borders: { preset: "all", style: "thin", color: colors.border },
      wrapText: true,
      verticalAlignment: "top",
    };
  }
}

referenceSheet.getRange("A2:B20").format.columnWidth = 28;
referenceSheet.getRange("B:B").format.columnWidth = 42;
referenceSheet.getRange("D:F").format.columnWidth = 26;
referenceSheet.getRange("G:J").format.columnWidth = 22;
referenceSheet.getRange("L:M").format.columnWidth = 40;

referenceSheet.getRange("D7:J10").format.fill = colors.lightBlue;
referenceSheet.getRange("L2:M6").format.fill = colors.green;
referenceSheet.getRange("A2:B20").format.fill = colors.amber;

const xlsx = await SpreadsheetFile.exportXlsx(workbook);
const outputPath = path.join(outDir, "familyos_household_memory_template.xlsx");
await xlsx.save(outputPath);

const templatePreview = await workbook.render({
  sheetName: "household_memory",
  range: "A1:S12",
  scale: 1,
  format: "png",
});
await fs.writeFile(
  path.join(outDir, "household_memory_preview.png"),
  new Uint8Array(await templatePreview.arrayBuffer()),
);

const referencePreview = await workbook.render({
  sheetName: "household_memory_reference",
  range: "A1:M14",
  scale: 1,
  format: "png",
});
await fs.writeFile(
  path.join(outDir, "household_memory_reference_preview.png"),
  new Uint8Array(await referencePreview.arrayBuffer()),
);

const imported = await SpreadsheetFile.importXlsx(xlsx);
const check = await imported.inspect({
  kind: "workbook,sheet,table",
  maxChars: 5000,
  tableMaxRows: 8,
  tableMaxCols: 8,
  tableMaxCellChars: 80,
});

console.log(JSON.stringify({
  outputPath,
  sheets: imported.worksheets.items.map((sheet) => sheet.name),
  inspect: check.ndjson,
}, null, 2));

function columnLetter(index) {
  let n = index;
  let out = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    out = String.fromCharCode(65 + r) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}
