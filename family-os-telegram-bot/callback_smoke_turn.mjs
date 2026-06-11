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

const chatId = process.argv[2] || "callback-smoke-v2";
const userText = process.argv[3] || "食咗1隻蛋";
const choiceIndex = Number(process.argv[4] || 0);
const telegramUserId = process.argv[5] || "7476829331";
const debug = process.argv.includes("--debug");
const bridge = new CodexBridge({ workspace });

if (debug) {
  const originalRunStructuredTurn = bridge.runStructuredTurnWithTimeout.bind(bridge);
  const originalExecuteBridgeCommand = bridge.executeBridgeCommand.bind(bridge);
  bridge.runStructuredTurnWithTimeout = async (thread, prompt, outputSchema) => {
    console.log("STRUCTURED_TURN_START");
    console.log(prompt);
    console.log("STRUCTURED_TURN_END");
    const result = await originalRunStructuredTurn(thread, prompt, outputSchema);
    console.log("MODEL_RESPONSE_START");
    console.log(result.finalResponse);
    console.log("MODEL_RESPONSE_END");
    return result;
  };
  bridge.executeBridgeCommand = (commandRequest) => {
    console.log("BROKER_COMMAND_REQUEST_START");
    console.log(JSON.stringify(commandRequest, null, 2));
    console.log("BROKER_COMMAND_REQUEST_END");
    const result = originalExecuteBridgeCommand(commandRequest);
    console.log("BROKER_COMMAND_RESULT_START");
    console.log(JSON.stringify(result, null, 2));
    console.log("BROKER_COMMAND_RESULT_END");
    return result;
  };
}

const firstReply = await bridge.run(chatId, userText, { telegramUserId });
const firstState = readChatState(chatId);
const choice = firstState.pending_choices?.[choiceIndex];
if (!choice) {
  throw new Error(`No pending choice at index ${choiceIndex}.`);
}
const resumedReply = await bridge.resumeFromCallback(chatId, choice.token, { telegramUserId });
const secondState = readChatState(chatId);

console.log(JSON.stringify({
  first_reply: firstReply,
  first_thread_id: firstState.thread_id,
  chosen_token: choice.token,
  chosen_label: choice.label,
  resumed_reply: resumedReply,
  second_thread_id: secondState.thread_id,
  pending_choices_after_resume: secondState.pending_choices,
}, null, 2));

function readChatState(chatId) {
  const statePath = path.join(scriptDir, ".codex-bridge-state.json");
  const parsed = JSON.parse(fs.readFileSync(statePath, "utf8"));
  return parsed.chats?.[String(chatId)] || {};
}

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
