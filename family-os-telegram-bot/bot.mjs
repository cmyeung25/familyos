import { CodexBridge } from "./codex_bridge.mjs";
import fs from "node:fs";
import { ensureParentDirectory, ensureRuntimeDirectories, resolveFamilyOsPaths } from "./instance_paths.mjs";
import { loadFamilyOsPersona } from "./persona_config.mjs";

const TELEGRAM_API = "https://api.telegram.org";
const isSelfTest = process.argv.includes("--self-test");
const runtimePaths = resolveFamilyOsPaths();
ensureRuntimeDirectories(runtimePaths);
const lockPath = runtimePaths.botLockPath;
const activityLogPath = runtimePaths.botActivityLogPath;
const fatalLogPath = runtimePaths.botFatalLogPath;
const startupDebugLogPath = runtimePaths.botStartupDebugLogPath;
const runtimeStatePath = runtimePaths.botRuntimeStatePath;
const heartbeatPath = runtimePaths.botHeartbeatPath;
const activeChatTurns = new Map();
const persona = loadFamilyOsPersona();

ensureParentDirectory(startupDebugLogPath);
fs.appendFileSync(startupDebugLogPath, `${JSON.stringify({
  timestamp: new Date().toISOString(),
  argv: process.argv.slice(1),
  has_telegram_token: Boolean(process.env.TELEGRAM_BOT_TOKEN),
  has_allowed_users: Boolean(process.env.TELEGRAM_ALLOWED_USER_IDS),
  has_api_url: Boolean(process.env.FAMILY_OS_API_URL),
  has_api_key: Boolean(process.env.FAMILY_OS_API_KEY),
  codex_home: process.env.CODEX_HOME || "",
})}\n`, "utf8");

process.on("uncaughtException", (error) => {
  logFatal("uncaughtException", error);
  process.exit(1);
});
process.on("unhandledRejection", (error) => {
  logFatal("unhandledRejection", error);
  process.exit(1);
});

const config = {
  telegramToken: process.env.TELEGRAM_BOT_TOKEN || (isSelfTest ? "123:abc" : requiredEnv("TELEGRAM_BOT_TOKEN")),
  apiUrl: process.env.FAMILY_OS_API_URL || "",
  apiKey: process.env.FAMILY_OS_API_KEY || "",
  envAllowedUserIds: new Set(splitCsv(process.env.TELEGRAM_ALLOWED_USER_IDS || "")),
  allowedUserIds: new Set(splitCsv(process.env.TELEGRAM_ALLOWED_USER_IDS || "")),
  allowlistSource: "env",
};
const bridge = new CodexBridge();

if (!/^\d+:[A-Za-z0-9_-]+$/.test(config.telegramToken)) {
  console.error("Startup failed: TELEGRAM_BOT_TOKEN format is invalid. Run configure-local-bot.ps1 and paste only the latest token from @BotFather.");
  process.exit(1);
}

if (isSelfTest) {
  await runSelfTest();
  process.exit(0);
}

acquireProcessLock();

let me;
while (true) {
  try {
    await telegram("deleteWebhook", { drop_pending_updates: false });
    me = await telegram("getMe");
    break;
  } catch (error) {
    if (error.message === "Unauthorized") {
      console.error("Startup failed: Telegram rejected TELEGRAM_BOT_TOKEN. Run configure-local-bot.ps1 again and paste the latest token returned by @BotFather.");
      process.exit(1);
    }
    console.error(new Date().toISOString(), `Startup Telegram check failed: ${error.message}`);
    await sleep(5000);
  }
}

console.log(`Family OS Telegram Bot started: @${me.username}`);
try {
  await refreshAllowlist({ reason: "startup" });
} catch (error) {
  config.allowedUserIds = new Set(config.envAllowedUserIds);
  config.allowlistSource = describeAllowlistSource(config.envAllowedUserIds.size, 0);
  logActivity("allowlist_refresh_failed", { reason: "startup", error: String(error.message || error) });
  console.error(`Startup allowlist refresh failed: ${error.message}`);
}
console.log(`Allowed Telegram user IDs: ${[...config.allowedUserIds].join(", ") || "(none; only /whoami is available)"}`);
console.log(`Allowlist source: ${config.allowlistSource}`);
console.log(`Codex Bridge ready: ${bridge.health().ok}`);
logActivity("bot_started", { bridge_ready: bridge.health().ok });
writeHeartbeat("started", { bridge_ready: bridge.health().ok });
setInterval(() => writeHeartbeat("idle"), 60000).unref();
setInterval(() => {
  refreshAllowlist({ reason: "periodic" }).catch((error) => {
    logActivity("allowlist_refresh_failed", { reason: "periodic", error: String(error.message || error) });
  });
}, 300000).unref();

let offset = readRuntimeState().offset || 0;
while (true) {
  try {
    writeHeartbeat("polling", { offset });
    const updates = await telegram("getUpdates", {
      offset,
      timeout: 25,
      allowed_updates: ["message", "callback_query"],
    });
    writeHeartbeat("poll_ok", { offset, updates: updates.length });
    for (const update of updates) {
      offset = update.update_id + 1;
      writeRuntimeState({ offset });
      handleUpdate(update).catch((error) => {
        logActivity("update_handler_failed", {
          update_id: update.update_id,
          error: String(error.message || error),
        });
      });
    }
  } catch (error) {
    console.error(new Date().toISOString(), error.message);
    await sleep(2000);
  }
}

async function handleUpdate(update) {
  if (update.callback_query) {
    await handleCallbackQuery(update.callback_query);
    return;
  }
  if (update.message) {
    await handleMessage(update.message);
  }
}

async function handleMessage(message) {
  if (!message?.text || message.from?.is_bot) return;
  const chatId = message.chat.id;
  const userId = String(message.from.id);
  const text = message.text.trim();

  logActivity("message_received", { user_id: userId, command: text.startsWith("/") });
  writeHeartbeat("message_received", { user_id: userId, chat_id: chatId });

  if (message.chat.type !== "private") {
    await reply(chatId, `${persona.firstPersonStyle}而家只可以喺 Telegram 私人對話入面幫手。`);
    return;
  }

  if (text === "/whoami") {
    await reply(chatId, `你的 Telegram user ID 係 ${userId}`);
    return;
  }
  if (!config.allowedUserIds.has(userId)) {
    await reply(chatId, `${persona.firstPersonStyle}未見到你喺 allowlist 入面。你的 Telegram user ID 係 ${userId}`);
    return;
  }
  if (text === "/start" || text === "/help") {
    await reply(chatId, helpText());
    return;
  }
  if (text === "/reset") {
    bridge.reset(chatId);
    await reply(chatId, `${persona.firstPersonStyle}已經清走呢個 Telegram 對話嘅 bridge 上下文。`);
    return;
  }
  if (text === "/bridgehealth") {
    await reply(chatId, formatBridgeHealthPlain(bridge.health()));
    return;
  }

  const activeTurn = activeChatTurns.get(String(chatId));
  if (activeTurn && Date.now() - activeTurn.started_at < 150000) {
    await reply(chatId, `${persona.firstPersonStyle}仲處理緊上一句，請等${persona.firstPersonStyle}做完，或者用 /reset 清走今次對話狀態。`);
    return;
  }

  try {
    activeChatTurns.set(String(chatId), { started_at: Date.now(), user_id: userId });
    await reply(chatId, buildAckText(text));
    const result = await withTimeout(
      bridge.run(chatId, text, { telegramUserId: userId }),
      150000,
      `${persona.firstPersonStyle}處理得比平時耐少少。你可以等一等，或者用 /reset 清走今次對話狀態。`,
    );
    writeHeartbeat("codex_turn_completed", { user_id: userId, chat_id: chatId });
    await replyResponse(chatId, result);
  } catch (error) {
    logActivity("codex_turn_failed", { user_id: userId, error: String(error.message || error) });
    writeHeartbeat("codex_turn_failed", { user_id: userId, chat_id: chatId, error: String(error.message || error) });
    await reply(chatId, `${persona.firstPersonStyle}啱啱卡住咗：${error.message}`);
  } finally {
    activeChatTurns.delete(String(chatId));
  }
}
async function handleCallbackQuery(query) {
  const userId = String(query.from?.id || "");
  const chatId = query.message?.chat?.id;
  logActivity("callback_received", {
    user_id: userId,
    chat_id: chatId,
    callback_data: String(query.data || ""),
  });
  if (!chatId) {
    await safeAnswerCallbackQuery(query.id, {
      callback_query_id: query.id,
      text: `${persona.firstPersonStyle}搵唔到原本嗰條訊息。`,
      show_alert: false,
    });
    return;
  }
  if (!config.allowedUserIds.has(userId)) {
    await safeAnswerCallbackQuery(query.id, {
      callback_query_id: query.id,
      text: `${persona.firstPersonStyle}未見到你喺 allowlist 入面。`,
      show_alert: true,
    });
    return;
  }

  const activeTurn = activeChatTurns.get(String(chatId));
  if (activeTurn && Date.now() - activeTurn.started_at < 150000) {
    await safeAnswerCallbackQuery(query.id, {
      callback_query_id: query.id,
      text: `${persona.firstPersonStyle}仲處理緊上一句。`,
      show_alert: false,
    });
    return;
  }

  try {
    activeChatTurns.set(String(chatId), { started_at: Date.now(), user_id: userId });
    await safeAnswerCallbackQuery(query.id, {
      callback_query_id: query.id,
      text: `${persona.firstPersonStyle}收到喇。`,
      show_alert: false,
    });
    await reply(chatId, buildCallbackAckText(query));
    const result = await withTimeout(
      bridge.resumeFromCallback(chatId, query.data || "", { telegramUserId: userId }),
      150000,
      `${persona.firstPersonStyle}處理緊你啱啱個選擇，但今次耐咗少少。你可以稍後再試。`,
    );
    if (result?.clear_inline_keyboard) {
      await clearInlineKeyboard(query);
    }
    await replyResponse(chatId, result);
    logActivity("callback_completed", {
      user_id: userId,
      chat_id: chatId,
      callback_data: String(query.data || ""),
    });
  } catch (error) {
    await safeAnswerCallbackQuery(query.id, {
      callback_query_id: query.id,
      text: `${persona.firstPersonStyle}今次未處理到你個選擇。`,
      show_alert: false,
    });
    logActivity("callback_failed", {
      user_id: userId,
      chat_id: chatId,
      callback_data: String(query.data || ""),
      error: String(error.message || error),
    });
    await reply(chatId, `${persona.firstPersonStyle}啱啱卡住咗：${error.message}`);
  } finally {
    activeChatTurns.delete(String(chatId));
  }
}
async function clearInlineKeyboard(query) {
  if (!query?.message?.message_id || !query?.message?.chat?.id) return;
  try {
    await telegram("editMessageReplyMarkup", {
      chat_id: query.message.chat.id,
      message_id: query.message.message_id,
      reply_markup: { inline_keyboard: [] },
    });
  } catch {
    // Best effort only.
  }
}

async function replyResponse(chatId, result) {
  const normalized = normalizeBridgeReply(result);
  await reply(chatId, normalized.text, {
    reply_markup: normalized.reply_markup || undefined,
  });
}

function normalizeBridgeReply(result) {
  if (typeof result === "string") {
    return {
      text: tryExtractBridgeReplyText(result) || String(result || "").trim() || `${persona.firstPersonStyle}已經處理好喇。`,
      reply_markup: null,
    };
  }
  if (!result || typeof result !== "object") {
    return { text: `${persona.firstPersonStyle}啱啱整理唔到回覆。`, reply_markup: null };
  }
  return {
    text: tryExtractBridgeReplyText(result.text) || String(result.text || "").trim() || `${persona.firstPersonStyle}已經幫你處理好喇。`,
    reply_markup: result.reply_markup || null,
  };
}

function tryExtractBridgeReplyText(value) {
  const text = String(value || "").trim();
  if (!text.startsWith("{") || !text.endsWith("}")) return "";
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object" && typeof parsed.reply_text === "string") {
      return parsed.reply_text.trim();
    }
  } catch {
    return "";
  }
  return "";
}

async function telegram(method, payload = {}) {
  const response = await fetchJson(`${TELEGRAM_API}/bot${config.telegramToken}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`Telegram ${method} failed: ${response.description || "unknown error"}`);
  return response.result;
}

async function reply(chatId, text, { reply_markup } = {}) {
  const chunks = splitTelegramText(String(text || ""), 3900);
  for (let index = 0; index < chunks.length; index += 1) {
    const payload = {
      chat_id: chatId,
      text: chunks[index],
    };
    if (index === 0 && reply_markup) {
      payload.reply_markup = reply_markup;
    }
    await telegram("sendMessage", payload);
  }
}

async function safeAnswerCallbackQuery(callbackQueryId, payload) {
  try {
    await telegram("answerCallbackQuery", payload);
  } catch (error) {
    logActivity("answer_callback_failed", {
      callback_query_id: callbackQueryId,
      error: String(error.message || error),
    });
  }
}

async function refreshAllowlist({ reason = "manual" } = {}) {
  const merged = new Set(config.envAllowedUserIds);
  let sheetCount = 0;
  if (config.apiUrl && config.apiKey) {
    const result = await invokeFamilyOsApi("get_telegram_allowlist", {});
    for (const userId of normalizeTelegramAllowlistResult(result)) {
      merged.add(userId);
      sheetCount += 1;
    }
  }
  config.allowedUserIds = merged;
  config.allowlistSource = describeAllowlistSource(config.envAllowedUserIds.size, sheetCount);
  logActivity("allowlist_refreshed", {
    reason,
    env_count: config.envAllowedUserIds.size,
    sheet_count: sheetCount,
    total_count: config.allowedUserIds.size,
    source: config.allowlistSource,
  });
  writeHeartbeat("allowlist_refreshed", {
    allowlist_count: config.allowedUserIds.size,
    allowlist_source: config.allowlistSource,
  });
  return config.allowedUserIds;
}

async function invokeFamilyOsApi(action, payload = {}) {
  const response = await withRetry(async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const httpResponse = await fetch(config.apiUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          api_key: config.apiKey,
          action,
          payload,
          request_text: `telegram bot startup action: ${action}`,
          actor_id: "telegram_bot_allowlist_loader",
        }),
        redirect: "follow",
        signal: controller.signal,
      });
      const text = await httpResponse.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`Family OS API returned non-JSON (${httpResponse.status}).`);
      }
      if (!httpResponse.ok || !data?.ok) {
        throw new Error(data?.error || `Family OS API failed (${httpResponse.status}).`);
      }
      return data.result;
    } catch (error) {
      if (error?.name === "AbortError") {
        throw new Error("Family OS API request timed out.");
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }, 2, 1200);
  return response;
}

function normalizeTelegramAllowlistResult(result) {
  const ids = Array.isArray(result?.allowed_user_ids)
    ? result.allowed_user_ids
    : Array.isArray(result)
    ? result
    : [];
  return ids
    .map((value) => String(value || "").trim())
    .filter((value) => /^\d+$/.test(value));
}

function describeAllowlistSource(envCount, sheetCount) {
  if (envCount > 0 && sheetCount > 0) return "env+sheet";
  if (sheetCount > 0) return "sheet";
  if (envCount > 0) return "env";
  return "none";
}

async function fetchJson(url, options) {
  try {
    return await withRetry(async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      try {
        const response = await fetch(url, {
          ...options,
          redirect: "follow",
          signal: controller.signal,
        });
        const text = await response.text();
        let data;
        try {
          data = JSON.parse(text);
        } catch {
          throw new Error(`Telegram returned non-JSON (${response.status}).`);
        }
        if (!response.ok) throw new Error(data.error?.message || data.description || `HTTP ${response.status}`);
        return data;
      } catch (error) {
        if (error?.name === "AbortError") {
          throw new Error("Telegram request timed out.");
        }
        throw error;
      } finally {
        clearTimeout(timeout);
      }
    }, 2, 1200);
  } catch (error) {
    throw new Error(String(error.message || error));
  }
}

function formatBridgeHealthPlain(health) {
  return [
    `Codex Bridge: ${health.ok ? "ok" : "not ready"}`,
    `Auth mode: ${health.auth_mode || "unknown"}`,
    `Codex login: ${health.checks.codex_login || "unknown"}`,
    `AGENTS.md: ${health.checks.agents_md ? "present" : "missing"}`,
    `Runtime knowledge root: ${health.checks.runtime_knowledge_root ? "present" : "missing"}`,
    ...Object.entries(health.checks.skills).map(([name, ok]) => `${name}: ${ok ? "present" : "missing"}`),
  ].join("\n");
}

function helpText() {
  const summary = persona.supportsBabyLogs
    ? "Family OS BB + 庫存 + 輕量 task。"
    : "Family OS 屋企存貨 + 提醒任務。";
  const examples = persona.supportsBabyLogs
    ? [
        "- BB 飲奶 90 ml",
        "- BB 換片",
        "- BB 瞓覺",
        "- 公仔麵而家得返 4 包",
        "- 買咗 10 隻蛋",
      ]
    : [
        "- 屋企而家有咩要補貨？",
        "- 公仔麵而家得返 4 包",
        "- 買咗 10 隻蛋",
        "- 提我聽日買洗潔精",
        "- 未來幾日有咩 task 要做？",
      ];
  return [
    `${persona.firstPersonStyle}而家主要幫手處理 ${summary}`,
    "",
    `你可以咁樣同${persona.firstPersonStyle}講：`,
    ...examples,
    "",
    "可用指令：",
    "/bridgehealth - 睇 bridge 狀態",
    "/reset - 清走今次 Telegram 對話狀態",
    "/whoami - 睇你嘅 Telegram user ID",
  ].join("\n");
}
async function runSelfTest() {
  const assert = (condition, message) => {
    if (!condition) {
      throw new Error(message);
    }
  };

  const chunks = splitTelegramText("a".repeat(8000), 3900);
  assert(chunks.length === 3 && chunks.every((chunk) => chunk.length <= 3900), "Self-test failed: Telegram reply chunking is invalid.");

  const normalized = normalizeBridgeReply({
    text: "test",
    reply_markup: {
      inline_keyboard: [[{ text: "普通飲水", callback_data: "cb_1" }]],
    },
  });
  assert(normalized.reply_markup?.inline_keyboard?.length, "Self-test failed: inline keyboard normalization is invalid.");
  assert(normalizeBridgeReply('{"status":"reply","reply_text":"hello","clarification":null,"command_request":null}').text === 'hello', "Self-test failed: raw JSON bridge reply was not normalized.");

  const originalReply = reply;
  const originalTelegram = telegram;
  const originalAllowedUserIds = config.allowedUserIds;
  const originalReset = bridge.reset;
  const originalRun = bridge.run;
  const originalResumeFromCallback = bridge.resumeFromCallback;

  const replies = [];
  const telegramCalls = [];
  const resetCalls = [];
  const runCalls = [];
  const callbackCalls = [];

  reply = async (chatId, text, options = {}) => {
    replies.push({ chatId, text, options });
  };
  telegram = async (method, payload = {}) => {
    telegramCalls.push({ method, payload });
    return { ok: true };
  };
  config.allowedUserIds = new Set(["42"]);
  bridge.reset = (chatId) => {
    resetCalls.push(chatId);
  };
  bridge.run = async (chatId, text, options = {}) => {
    runCalls.push({ chatId, text, options });
    return { text: "done" };
  };
  bridge.resumeFromCallback = async (chatId, data, options = {}) => {
    callbackCalls.push({ chatId, data, options });
    return { text: "picked", clear_inline_keyboard: true };
  };

  try {
    await handleMessage({
      text: "/reset",
      from: { id: 42, is_bot: false },
      chat: { id: 1001, type: "private" },
    });
    assert(resetCalls.length === 1 && resetCalls[0] === 1001, "Self-test failed: /reset did not clear chat state.");

    replies.length = 0;
    await handleMessage({
      text: "buy milk",
      from: { id: 42, is_bot: false },
      chat: { id: 1001, type: "private" },
    });
    assert(runCalls.length === 1 && runCalls[0].chatId === 1001 && runCalls[0].options.telegramUserId === "42", "Self-test failed: normal message flow did not invoke bridge.run correctly.");
    assert(replies.length >= 2, "Self-test failed: normal message flow did not send ack and result.");

    replies.length = 0;
    telegramCalls.length = 0;
    await handleCallbackQuery({
      id: "cb-1",
      data: "cb_1",
      from: { id: 42 },
      message: {
        message_id: 77,
        chat: { id: 1001 },
        reply_markup: {
          inline_keyboard: [[{ text: "普通飲水", callback_data: "cb_1" }]],
        },
      },
    });
    assert(callbackCalls.length === 1 && callbackCalls[0].data === "cb_1", "Self-test failed: callback flow did not invoke bridge.resumeFromCallback correctly.");
    assert(telegramCalls.some((entry) => entry.method === "answerCallbackQuery"), "Self-test failed: callback flow did not answer the callback query.");
    assert(telegramCalls.some((entry) => entry.method === "editMessageReplyMarkup"), "Self-test failed: callback flow did not clear the inline keyboard.");
    assert(replies.some((entry) => entry.text === `${persona.firstPersonStyle}收到喇，你揀咗：普通飲水`), "Self-test failed: callback flow did not send the callback ack.");
    assert(replies.some((entry) => entry.text === "picked"), "Self-test failed: callback flow did not send the reply.");
  } finally {
    reply = originalReply;
    telegram = originalTelegram;
    config.allowedUserIds = originalAllowedUserIds;
    bridge.reset = originalReset;
    bridge.run = originalRun;
    bridge.resumeFromCallback = originalResumeFromCallback;
    activeChatTurns.clear();
  }

  console.log("Family OS Telegram Bot self-test passed.");
}
function splitTelegramText(text, maximumLength) {
  if (text.length <= maximumLength) return [text];
  const chunks = [];
  let remaining = text;
  while (remaining.length > maximumLength) {
    let splitAt = remaining.lastIndexOf("\n", maximumLength);
    if (splitAt <= 0) splitAt = maximumLength;
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).replace(/^\n/, "");
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

function splitCsv(value) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function buildAckText(text) {
  const summary = String(text || "").replace(/\s+/g, " ").trim();
  const preview = summary.length > 80 ? `${summary.slice(0, 80)}...` : summary;
  return `${persona.firstPersonStyle}收到，等${persona.firstPersonStyle}而家幫你處理：${preview}`;
}
function buildCallbackAckText(query) {
  const selectedLabel = findCallbackButtonLabel(query);
  if (selectedLabel) {
    return `${persona.firstPersonStyle}收到喇，你揀咗：${selectedLabel}`;
  }
  return `${persona.firstPersonStyle}收到你啱啱個選擇喇，我而家接住幫你處理。`;
}

function findCallbackButtonLabel(query) {
  const callbackData = String(query?.data || "").trim();
  const keyboard = query?.message?.reply_markup?.inline_keyboard;
  if (!callbackData || !Array.isArray(keyboard)) return "";
  for (const row of keyboard) {
    if (!Array.isArray(row)) continue;
    for (const button of row) {
      if (String(button?.callback_data || "").trim() === callbackData) {
        return String(button?.text || "").trim();
      }
    }
  }
  return "";
}

function withTimeout(promise, timeoutMs, message) {
  let timeout;
  const timer = new Promise((_, reject) => {
    timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timer]).finally(() => clearTimeout(timeout));
}

function readRuntimeState() {
  try {
    return JSON.parse(fs.readFileSync(runtimeStatePath, "utf8"));
  } catch {
    return {};
  }
}

function writeRuntimeState(state) {
  ensureParentDirectory(runtimeStatePath);
  fs.writeFileSync(runtimeStatePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function writeHeartbeat(status, extra = {}) {
  ensureParentDirectory(heartbeatPath);
  fs.writeFileSync(heartbeatPath, `${JSON.stringify({
    pid: process.pid,
    status,
    timestamp: new Date().toISOString(),
    active_chat_turns: activeChatTurns.size,
    ...extra,
  }, null, 2)}\n`, "utf8");
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry(fn, attempts, delayMs) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt >= attempts) break;
      await sleep(delayMs);
    }
  }
  throw lastError;
}

function logActivity(event, details = {}) {
  ensureParentDirectory(activityLogPath);
  fs.appendFileSync(activityLogPath, `${JSON.stringify({
    timestamp: new Date().toISOString(),
    event,
    ...details,
  })}\n`, "utf8");
}

function logFatal(event, error) {
  ensureParentDirectory(fatalLogPath);
  fs.appendFileSync(fatalLogPath, `${JSON.stringify({
    timestamp: new Date().toISOString(),
    event,
    error: String(error?.stack || error?.message || error),
  })}\n`, "utf8");
}

function acquireProcessLock() {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      fs.writeFileSync(lockPath, `${process.pid}\n`, { encoding: "utf8", flag: "wx" });
      const release = () => {
        try {
          if (fs.readFileSync(lockPath, "utf8").trim() === String(process.pid)) {
            fs.unlinkSync(lockPath);
          }
        } catch {
          // Best effort.
        }
      };
      process.once("exit", release);
      process.once("SIGINT", () => {
        release();
        process.exit(0);
      });
      process.once("SIGTERM", () => {
        release();
        process.exit(0);
      });
      return;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      let existingPid = "";
      try {
        existingPid = fs.readFileSync(lockPath, "utf8").trim();
        process.kill(Number(existingPid), 0);
      } catch {
        try {
          fs.unlinkSync(lockPath);
        } catch {
          // Another startup may have refreshed the lock.
        }
        continue;
      }
      throw new Error(`Family OS Telegram Bot is already running (PID ${existingPid}).`);
    }
  }
  throw new Error("Unable to acquire the Family OS Telegram Bot process lock.");
}


