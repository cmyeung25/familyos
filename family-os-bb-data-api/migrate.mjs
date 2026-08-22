import { config, importSourceRecord, importedSourceCount, pool } from "./lib.mjs";
import { parseTimestamp, toHongKongTimestamp } from "./mapping.mjs";

const sourceApiUrl = String(process.env.FAMILY_OS_API_URL || "").trim();
const sourceApiKey = String(process.env.FAMILY_OS_API_KEY || "").trim();

if (!sourceApiUrl || !sourceApiKey) throw new Error("FAMILY_OS_API_URL and FAMILY_OS_API_KEY are required for migration.");
if (!config.migrationFrom) throw new Error("FAMILY_OS_BB_MIGRATION_FROM is required for migration.");

async function callSource(payload) {
  const response = await fetch(sourceApiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: sourceApiKey,
      action: "query_baby_logs",
      payload,
      request_text: "One-time MariaDB BB log migration",
    }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || data?.ok !== true) throw new Error(data?.error || `Source API failed (${response.status}).`);
  return data.result;
}

function nextWindowStart(end) {
  return new Date(end.getTime() + 1);
}

function toSourceTimestamp(value) {
  // Apps Script accepts second precision only, while the MariaDB mapper keeps milliseconds.
  return toHongKongTimestamp(value).replace(/\.\d{3}(?=\+08:00$)/, "");
}

const report = {
  source: "google_sheets_baby_log",
  migration_from: config.migrationFrom,
  migration_to: toHongKongTimestamp(new Date()),
  fetched: 0,
  imported: 0,
  skipped: 0,
  unsupported: {},
  failed: [],
};

try {
  let windowStart = parseTimestamp(config.migrationFrom, "FAMILY_OS_BB_MIGRATION_FROM");
  const finalEnd = new Date();
  while (windowStart <= finalEnd) {
    const windowEnd = new Date(Math.min(finalEnd.getTime(), windowStart.getTime() + 30 * 86400000 - 1));
    let cursor = "";
    do {
      const page = await callSource({
        from: toSourceTimestamp(windowStart),
        to: toSourceTimestamp(windowEnd),
        limit: 200,
        cursor,
      });
      for (const record of page.items || []) {
        report.fetched += 1;
        try {
          const result = await importSourceRecord(record);
          if (result.status === "imported") report.imported += 1;
          if (result.status === "skipped") report.skipped += 1;
          if (result.status === "unsupported") {
            report.unsupported[result.log_type || "unknown"] = (report.unsupported[result.log_type || "unknown"] || 0) + 1;
          }
        } catch (error) {
          report.failed.push({ baby_log_id: record.baby_log_id || "", error: error.message || "Unknown migration error." });
        }
      }
      cursor = page.page?.has_more ? page.page.next_cursor : "";
    } while (cursor);
    windowStart = nextWindowStart(windowEnd);
  }
  report.imported_source_total = await importedSourceCount();
  console.log(JSON.stringify(report));
  if (report.failed.length) process.exitCode = 2;
} finally {
  await pool.end();
}
