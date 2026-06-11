import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(scriptDir, "..");
const manifestPath = path.join(workspaceRoot, "inventory-v2-migration-manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const explicitSheetId = process.argv[2] ? Number(process.argv[2]) : NaN;
const targetSheetId = Number.isFinite(explicitSheetId) ? explicitSheetId : manifest.sheet_id;

const rows = manifest.rows || [];
if (rows.length === 0) {
  throw new Error("Inventory v2 manifest is empty.");
}

const categoryData = rows.map((row) => row.category_v2 || "").join("\n");
const preferredBrandData = rows.map((row) => row.preferred_brand || "").join("\n");
const v2BlockData = [
  manifest.new_columns,
  ...rows.map((row) => [
    row.canonical_item_name || "",
    row.target_group || "",
    row.brand_name || "",
  ]),
].map((entry) => entry.join("\t")).join("\n");

const requests = [
  {
    pasteData: {
      coordinate: {
        sheetId: targetSheetId,
        rowIndex: rows[0].row_number - 1,
        columnIndex: 3,
      },
      data: categoryData,
      type: "PASTE_NORMAL",
      delimiter: "\t",
    },
  },
  {
    pasteData: {
      coordinate: {
        sheetId: targetSheetId,
        rowIndex: rows[0].row_number - 1,
        columnIndex: 8,
      },
      data: preferredBrandData,
      type: "PASTE_NORMAL",
      delimiter: "\t",
    },
  },
  {
    pasteData: {
      coordinate: {
        sheetId: targetSheetId,
        rowIndex: 0,
        columnIndex: 21,
      },
      data: v2BlockData,
      type: "PASTE_NORMAL",
      delimiter: "\t",
    },
  },
];

process.stdout.write(`${JSON.stringify(requests, null, 2)}\n`);
