import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

const serverPath = fileURLToPath(new URL("../server.mjs", import.meta.url));
const appPath = fileURLToPath(new URL("../public/app.js", import.meta.url));

test("iPad health contract follows the configured backend and never treats the setting as a display-only label", async () => {
  const server = await readFile(serverPath, "utf8");

  assert.match(server, /FAMILY_OS_BB_DATA_BACKEND/);
  assert.match(server, /dataBackend === "apps_script"/);
  assert.match(server, /dataBackend === "mariadb"/);
  assert.match(server, /callConfiguredDataApi/);
  assert.match(server, /FAMILY_OS_BB_DATA_API_URL and FAMILY_OS_BB_DATA_API_KEY/);
});

test("settings maps only known backend and storage pairs to user-facing labels", async () => {
  const app = await readFile(appPath, "utf8");

  assert.match(app, /path\?\.api === "apps_script" && path\?\.storage === "google_sheets"/);
  assert.match(app, /path\?\.api === "bb_data_api" && path\?\.storage === "mariadb"/);
  assert.match(app, /dataSourceUnknown/);
});
