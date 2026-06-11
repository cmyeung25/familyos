import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { CodexBridge } from "./codex_bridge.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const workspace = path.resolve(scriptDir, "..");
const localCodexHome = path.join(scriptDir, ".codex-home");
const seedAuthPath = path.join(process.env.USERPROFILE || "", ".codex", "auth.json");
const localAuthPath = path.join(localCodexHome, "auth.json");

process.env.CODEX_HOME = localCodexHome;
await fs.promises.mkdir(localCodexHome, { recursive: true });
if (fs.existsSync(seedAuthPath)) {
  const seedStat = await fs.promises.stat(seedAuthPath);
  const localStat = fs.existsSync(localAuthPath) ? await fs.promises.stat(localAuthPath) : null;
  if (!localStat || seedStat.mtimeMs > localStat.mtimeMs) {
    await fs.promises.copyFile(seedAuthPath, localAuthPath);
  }
}
await fs.promises.writeFile(
  path.join(localCodexHome, "config.toml"),
  buildLocalCodexConfig(workspace),
  "utf8",
);

loadFamilyOsApiEnvironment();

const chatId = process.argv[2] || "smoke";
const userText = process.argv[3] || "而家有咩要補貨？";
const telegramUserId = process.argv[4] || "7476829331";
const bridge = new CodexBridge({ workspace });
const reply = await bridge.run(chatId, userText, { telegramUserId });
console.log(typeof reply === "string" ? reply : JSON.stringify(reply, null, 2));

function loadFamilyOsApiEnvironment() {
  const configPath = path.join(workspace, "family-os-apps-script", "local-api-config.json");
  if (!fs.existsSync(configPath) && process.env.FAMILY_OS_API_URL && process.env.FAMILY_OS_API_KEY) return;
  const ps = [
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
  const output = execFileSync("powershell.exe", ["-NoProfile", "-Command", ps], {
    cwd: workspace,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim().split(/\r?\n/);
  if (output[0]) process.env.FAMILY_OS_API_URL = output[0];
  if (output[1]) process.env.FAMILY_OS_API_KEY = output[1];
}

function buildLocalCodexConfig(workspaceRoot) {
  const projectKey = workspaceRoot.toLowerCase();
  return [
    "model = \"gpt-5.4\"",
    "model_reasoning_effort = \"medium\"",
    "approval_policy = \"never\"",
    "sandbox_mode = \"workspace-write\"",
    "",
    "[windows]",
    "sandbox = \"elevated\"",
    "",
    `[projects.'${projectKey}']`,
    "trust_level = \"trusted\"",
    "",
    "[sandbox_workspace_write]",
    "network_access = true",
    `writable_roots = ['${workspaceRoot.replaceAll("\\", "\\\\")}']`,
    "",
  ].join("\n");
}
