import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

const serverPath = fileURLToPath(new URL("../server.mjs", import.meta.url));
const appPath = fileURLToPath(new URL("../public/app.js", import.meta.url));

test("iPad health contract reports the implemented Apps Script and Sheets data path", async () => {
  const server = await readFile(serverPath, "utf8");

  assert.match(server, /const dataPath = Object\.freeze\(\{ api: "apps_script", storage: "google_sheets" \}\)/);
  assert.match(server, /data_path: dataPath/);
});

test("settings maps only known backend and storage pairs to user-facing labels", async () => {
  const app = await readFile(appPath, "utf8");

  assert.match(app, /path\?\.api === "apps_script" && path\?\.storage === "google_sheets"/);
  assert.match(app, /path\?\.api === "bb_data_api" && path\?\.storage === "mariadb"/);
  assert.match(app, /dataSourceUnknown/);
});
