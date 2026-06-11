import fs from "node:fs";
import { ensureParentDirectory, ensureRuntimeDirectories, resolveFamilyOsPaths } from "./instance_paths.mjs";

const TELEGRAM_API = "https://api.telegram.org";
const runtimePaths = resolveFamilyOsPaths();
ensureRuntimeDirectories(runtimePaths);
const configPath = runtimePaths.reminderConfigPath;
const statePath = runtimePaths.reminderStatePath;
const lockPath = runtimePaths.reminderLockPath;
const activityLogPath = runtimePaths.reminderActivityLogPath;
const fatalLogPath = runtimePaths.reminderFatalLogPath;
const isSelfTest = process.argv.includes("--self-test");
const isDryRun = process.argv.includes("--dry-run");
const dueNowCatchupGraceMs = 5 * 60000;

process.on("uncaughtException", (error) => {
  logFatal("uncaughtException", error);
  process.exit(1);
});

process.on("unhandledRejection", (error) => {
  logFatal("unhandledRejection", error);
  process.exit(1);
});

if (isSelfTest) {
  runSelfTest();
  process.exit(0);
}

acquireProcessLock();

const runtime = {
  telegramToken: requiredEnv("TELEGRAM_BOT_TOKEN"),
  apiUrl: requiredEnv("FAMILY_OS_API_URL"),
  apiKey: requiredEnv("FAMILY_OS_API_KEY"),
};

const config = readReminderConfig(configPath);
const state = readJsonFile(statePath, { version: 1, recipients: {} });

try {
  const snapshot = await collectSnapshot(runtime, config);
  const workingState = isDryRun ? cloneJson(state) : state;
  const planned = buildReminderPlan(config, workingState, snapshot, new Date());
  logActivity("plan_built", {
    recipients: planned.length,
    low_stock_count: snapshot.lowStockItems.length,
    upcoming_task_count: snapshot.upcomingTasks.length,
    dry_run: isDryRun,
  });

  if (isDryRun) {
    console.log(JSON.stringify({
      ok: true,
      planned,
      snapshot: {
        low_stock_count: snapshot.lowStockItems.length,
        upcoming_task_count: snapshot.upcomingTasks.length,
      },
    }, null, 2));
  } else {
    await dispatchPlan(runtime, planned);
    workingState.last_run_at = new Date().toISOString();
    writeJsonFile(statePath, workingState);
  }
} finally {
  releaseProcessLock();
}

async function collectSnapshot(runtimeConfig, reminderConfig) {
  const maxTaskDays = Math.max(
    7,
    ...reminderConfig.recipients.map((recipient) => Number(recipient.preferences?.task_window_days || 7) || 7),
  );
  const [lowStockItems, upcomingTasks, overdueTasks, taskContextHints] = await Promise.all([
    invokeFamilyOsApi(runtimeConfig, "get_low_stock_items", {}),
    invokeFamilyOsApi(runtimeConfig, "get_upcoming_tasks", { days: Math.min(maxTaskDays, 30) }),
    invokeFamilyOsApi(runtimeConfig, "get_overdue_tasks", {}),
    invokeFamilyOsApi(runtimeConfig, "get_task_context_hints", { status: "active" }),
  ]);
  return {
    lowStockItems: Array.isArray(lowStockItems) ? lowStockItems : [],
    upcomingTasks: mergeTaskLists(
      Array.isArray(upcomingTasks) ? upcomingTasks : [],
      Array.isArray(overdueTasks) ? overdueTasks : [],
    ),
    taskContextHints: Array.isArray(taskContextHints) ? taskContextHints : [],
  };
}

function buildReminderPlan(reminderConfig, reminderState, snapshot, now) {
  const timezone = reminderConfig.timezone || "Asia/Hong_Kong";
  const plan = [];
  for (const recipient of reminderConfig.recipients) {
    if (!recipient.enabled) continue;
    if (!recipient.chat_id) continue;

    const recipientState = ensureRecipientState(reminderState, recipient);
    const messages = [];
    const quiet = isInsideQuietHours(now, timezone, recipient.quiet_hours);
    const quietStartedAt = parseTimestamp(recipientState.quiet_period_started_at);

    if (!quiet) {
      recipientState.quiet_period_started_at = "";
      const lowStockMessage = buildInstantLowStockMessage(recipient, recipientState, snapshot.lowStockItems);
      if (lowStockMessage) messages.push(lowStockMessage);

      const taskMessageResult = buildTaskReminderMessages(
        recipient,
        recipientState,
        snapshot.upcomingTasks,
        snapshot.taskContextHints,
        now,
        { quietStartedAt },
      );
      messages.push(...taskMessageResult.messages);

      const digestMessage = buildDailyDigestMessage(
        recipient,
        recipientState,
        snapshot,
        now,
        timezone,
        {
          suppressedTaskKeys: taskMessageResult.notifiedTaskKeys,
          skippedTaskReminderCount: taskMessageResult.notifiedTaskCount,
        },
      );
      if (digestMessage) messages.push(digestMessage);
    } else {
      if (!quietStartedAt) {
        recipientState.quiet_period_started_at = now.toISOString();
      }
      updateActiveLowStockState(recipientState, snapshot.lowStockItems);
      if (recipient.preferences?.task_due_now_bypass_quiet_hours) {
        const taskMessageResult = buildTaskReminderMessages(
          recipient,
          recipientState,
          snapshot.upcomingTasks,
          snapshot.taskContextHints,
          now,
          { quietStartedAt, onlyDueNow: true },
        );
        messages.push(...taskMessageResult.messages);
      }
    }

    pruneSentKeys(recipientState, now);
    if (messages.length === 0) continue;

    plan.push({
      recipient,
      messages,
    });
  }
  return plan;
}

function buildInstantLowStockMessage(recipient, recipientState, lowStockItems) {
  const mode = String(recipient.preferences?.low_stock_mode || "off").toLowerCase();
  const currentKeys = lowStockItems.map(lowStockItemKey);
  const previousKeys = new Set(recipientState.active_low_stock_ids || []);
  const newItems = lowStockItems.filter((item) => !previousKeys.has(lowStockItemKey(item)));
  recipientState.active_low_stock_ids = currentKeys;

  if (mode !== "instant" || newItems.length === 0) return "";

  return [
    `提提你，而家有 ${newItems.length} 樣存貨已經偏低，可以開始留意補貨喇：`,
    ...newItems.map((item) => `- ${formatLowStockItem(item)}`),
  ].join("\n");
}

function buildTaskReminderMessages(recipient, recipientState, upcomingTasks, taskContextHints, now, { quietStartedAt = null, onlyDueNow = false } = {}) {
  const timezone = "Asia/Hong_Kong";
  const messages = [];
  const prefs = recipient.preferences || {};
  const windowDays = Number(prefs.task_window_days || 7) || 7;
  const minimumHoursLeft = quietStartedAt
    ? (quietStartedAt.getTime() - now.getTime()) / 3600000
    : -(dueNowCatchupGraceMs / 3600000);
  const filteredTasks = upcomingTasks.filter((task) =>
    taskMatchesRecipient(task, recipient, windowDays, now, { minimumHoursLeft }),
  );

  const dueNow = [];
  const dueSoon = [];
  const dueToday = [];
  const notifiedTaskKeys = new Set();
  for (const task of filteredTasks) {
    const dueAt = parseTimestamp(task.due_at);
    if (!dueAt) continue;
    const hoursLeft = (dueAt.getTime() - now.getTime()) / 3600000;
    const taskKey = buildTaskReminderKey(task);
    if (prefs.task_due_now && shouldSendDueNowReminder(dueAt, now, quietStartedAt)) {
      const sentKey = `task_due_now:${taskKey}`;
      if (!recipientState.sent_keys[sentKey]) {
        recipientState.sent_keys[sentKey] = now.toISOString();
        dueNow.push(task);
        notifiedTaskKeys.add(taskKey);
      }
      continue;
    }
    if (!onlyDueNow && prefs.task_due_2h && hoursLeft >= 0 && hoursLeft <= 2) {
      const sentKey = `task_due_2h:${taskKey}`;
      if (!recipientState.sent_keys[sentKey]) {
        recipientState.sent_keys[sentKey] = now.toISOString();
        dueSoon.push(task);
        notifiedTaskKeys.add(taskKey);
      }
      continue;
    }
    if (!onlyDueNow && prefs.task_due_24h && hoursLeft > 2 && hoursLeft <= 24) {
      const sentKey = `task_due_24h:${taskKey}`;
      if (!recipientState.sent_keys[sentKey]) {
        recipientState.sent_keys[sentKey] = now.toISOString();
        dueToday.push(task);
        notifiedTaskKeys.add(taskKey);
      }
    }
  }

  if (dueNow.length > 0) {
    messages.push([
      `提提你，以下 ${dueNow.length} 項 task 而家到鐘喇：`,
      ...dueNow.flatMap((task) => formatTaskWithHints(task, taskContextHints, timezone, now, { limit: 2 })),
    ].join("\n"));
  }

  if (dueSoon.length > 0) {
    messages.push([
      `提提你，有 ${dueSoon.length} 項 task 會喺 2 個鐘內到：`,
      ...dueSoon.flatMap((task) => formatTaskWithHints(task, taskContextHints, timezone, now, { limit: 2 })),
    ].join("\n"));
  }

  if (dueToday.length > 0) {
    messages.push([
      `提提你，未來 24 個鐘內有 ${dueToday.length} 項 task 要留意：`,
      ...dueToday.flatMap((task) => formatTaskWithHints(task, taskContextHints, timezone, now, { limit: 2 })),
    ].join("\n"));
  }

  return {
    messages,
    notifiedTaskKeys,
    notifiedTaskCount: notifiedTaskKeys.size,
  };
}

function buildDailyDigestMessage(
  recipient,
  recipientState,
  snapshot,
  now,
  timezone,
  { suppressedTaskKeys = new Set(), skippedTaskReminderCount = 0 } = {},
) {
  const digest = recipient.preferences?.daily_digest || {};
  if (!digest.enabled) return "";

  const localNow = zonedDateParts(now, timezone);
  const todayKey = `${localNow.year}-${pad2(localNow.month)}-${pad2(localNow.day)}`;
  if (recipientState.last_daily_digest_date === todayKey) return "";
  if (!hasReachedTime(localNow, String(digest.time || "09:00"))) return "";

  const taskWindowHours = Number(digest.task_window_hours || 36) || 36;
  const digestTasks = snapshot.upcomingTasks.filter((task) => {
    if (!taskMatchesRecipient(task, recipient, 7, now)) return false;
    const dueAt = parseTimestamp(task.due_at);
    if (!dueAt) return false;
    const hoursLeft = (dueAt.getTime() - now.getTime()) / 3600000;
    if (hoursLeft < 0 || hoursLeft > taskWindowHours) return false;
    return !suppressedTaskKeys.has(buildTaskReminderKey(task));
  });

  recipientState.last_daily_digest_date = todayKey;

  const lines = ["早晨，呢個係你今日嘅屋企小摘要："];
  if (snapshot.lowStockItems.length > 0) {
    lines.push("低存貨方面：");
    lines.push(...snapshot.lowStockItems.slice(0, 12).map((item) => `- ${formatLowStockItem(item)}`));
  }
  if (digestTasks.length > 0) {
    if (lines.length > 1) lines.push("");
    lines.push(`未來 ${taskWindowHours} 個鐘要留意嘅 task：`);
    lines.push(...digestTasks.slice(0, 8).flatMap((task) => formatTaskWithHints(task, snapshot.taskContextHints, timezone, now, { limit: 1 })));
  } else if (skippedTaskReminderCount > 0) {
    if (lines.length > 1) lines.push("");
    lines.push("今日要留意嘅 task，多比啱啱已經另外提咗你喇。");
  }
  if (lines.length === 1) {
    lines.push("今日暫時冇特別要跟進嘅低存貨或者 task。");
  }
  return lines.join("\n");
}

async function dispatchPlan(runtimeConfig, plannedMessages) {
  for (const entry of plannedMessages) {
    const recipientLabel = entry.recipient.name || entry.recipient.telegram_user_id || entry.recipient.chat_id;
    for (const message of entry.messages) {
      await sendTelegramMessage(runtimeConfig.telegramToken, entry.recipient.chat_id, message);
      logActivity("reminder_sent", {
        recipient: recipientLabel,
        chat_id: entry.recipient.chat_id,
        preview: String(message).slice(0, 120),
      });
    }
  }
}

async function sendTelegramMessage(telegramToken, chatId, text) {
  for (const chunk of splitTelegramText(String(text || ""), 3900)) {
    const response = await withRetry(() => fetchJson(`${TELEGRAM_API}/bot${telegramToken}/sendMessage`, {
      method: "POST",
      redirect: "follow",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: chunk }),
    }, 30000), 2, 1200);
    if (!response.ok) {
      throw new Error(`Telegram sendMessage failed: ${response.description || "unknown error"}`);
    }
  }
}

async function invokeFamilyOsApi(runtimeConfig, action, payload) {
  const response = await withRetry(() => fetchJson(runtimeConfig.apiUrl, {
    method: "POST",
    redirect: "follow",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      api_key: runtimeConfig.apiKey,
      action,
      payload,
      request_text: `reminder worker action: ${action}`,
      actor_id: "telegram_reminder_worker",
    }),
  }, 30000), 2, 1200);
  if (!response.ok) {
    throw new Error(response.error || `Family OS API failed for ${action}.`);
  }
  return response.result;
}

async function fetchJson(url, options, timeoutMs = 30000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`Non-JSON response (${response.status}) from ${redact(url)}.`);
    }
    if (!response.ok) {
      throw new Error(data.error?.message || data.description || `HTTP ${response.status}`);
    }
    return data;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`Request timed out after ${timeoutMs}ms: ${redact(url)}`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function readReminderConfig(filePath) {
  const config = readJsonFile(filePath, null);
  if (!config || !Array.isArray(config.recipients)) {
    throw new Error("reminder-config.json is missing or invalid.");
  }
  return {
    timezone: config.timezone || "Asia/Hong_Kong",
    recipients: config.recipients.map(normalizeRecipientConfig),
  };
}

function normalizeRecipientConfig(recipient) {
  return {
    enabled: recipient.enabled !== false,
    name: String(recipient.name || recipient.telegram_user_id || recipient.chat_id || "recipient"),
    telegram_user_id: String(recipient.telegram_user_id || ""),
    chat_id: String(recipient.chat_id || recipient.telegram_user_id || ""),
    role: String(recipient.role || "family"),
    person_scope: normalizeRecipientPersonScope(recipient.person_scope || recipient),
    quiet_hours: normalizeQuietHours(recipient.quiet_hours),
    preferences: normalizeRecipientPreferences(recipient.preferences || {}),
  };
}

function normalizeRecipientPersonScope(personScope) {
  const ownerPersonIds = normalizeStringList(
    personScope?.owner_person_ids ?? personScope?.person_ids ?? [],
  );
  const relatedPersonIds = normalizeStringList(
    personScope?.related_person_ids ?? [],
  );
  const primaryPersonId = firstNonEmptyString(
    personScope?.primary_person_id,
    ownerPersonIds[0],
    relatedPersonIds[0],
  );
  return {
    primary_person_id: primaryPersonId,
    owner_person_ids: ownerPersonIds,
    related_person_ids: relatedPersonIds,
  };
}

function normalizeRecipientPreferences(preferences) {
  return {
    low_stock_mode: String(preferences.low_stock_mode || "off").toLowerCase(),
    task_due_now: Boolean(preferences.task_due_now),
    task_due_now_bypass_quiet_hours: preferences.task_due_now_bypass_quiet_hours !== false,
    task_due_24h: preferences.task_due_24h !== false,
    task_due_2h: Boolean(preferences.task_due_2h),
    task_window_days: Number(preferences.task_window_days || 7) || 7,
    task_categories: Array.isArray(preferences.task_categories) ? preferences.task_categories.map(String) : [],
    daily_digest: {
      enabled: Boolean(preferences.daily_digest?.enabled),
      time: String(preferences.daily_digest?.time || "09:00"),
      task_window_hours: Number(preferences.daily_digest?.task_window_hours || 36) || 36,
    },
  };
}

function normalizeQuietHours(quietHours) {
  if (!quietHours || typeof quietHours !== "object") {
    return { enabled: false, start: "23:00", end: "07:00" };
  }
  return {
    enabled: Boolean(quietHours.enabled),
    start: String(quietHours.start || "23:00"),
    end: String(quietHours.end || "07:00"),
  };
}

function ensureRecipientState(reminderState, recipient) {
  const key = recipient.telegram_user_id || recipient.chat_id;
  reminderState.recipients[key] = reminderState.recipients[key] || {
    active_low_stock_ids: [],
    sent_keys: {},
    last_daily_digest_date: "",
    quiet_period_started_at: "",
  };
  return reminderState.recipients[key];
}

function updateActiveLowStockState(recipientState, lowStockItems) {
  recipientState.active_low_stock_ids = lowStockItems.map(lowStockItemKey);
}

function taskMatchesRecipient(task, recipient, windowDays, now, { minimumHoursLeft = 0 } = {}) {
  const dueAt = parseTimestamp(task.due_at);
  if (!dueAt) return false;
  const hoursLeft = (dueAt.getTime() - now.getTime()) / 3600000;
  if (hoursLeft < minimumHoursLeft || hoursLeft > windowDays * 24) return false;
  const categories = recipient.preferences?.task_categories || [];
  if (categories.length > 0 && !categories.includes(String(task.category || ""))) return false;
  return taskMatchesRecipientPersonScope(task, recipient);
}

function taskMatchesRecipientPersonScope(task, recipient) {
  const taskPersonIds = collectTaskPersonIds(task);
  if (taskPersonIds.size === 0) return true;
  const recipientPersonIds = collectRecipientPersonIds(recipient);
  if (recipientPersonIds.size === 0) return true;
  for (const personId of taskPersonIds) {
    if (recipientPersonIds.has(personId)) {
      return true;
    }
  }
  return false;
}

function collectTaskPersonIds(task) {
  return new Set(normalizeStringList([
    task?.owner_person_id,
    task?.related_person_id,
  ]));
}

function collectRecipientPersonIds(recipient) {
  return new Set(normalizeStringList([
    ...(recipient.person_scope?.owner_person_ids || []),
    ...(recipient.person_scope?.related_person_ids || []),
  ]));
}

function mergeTaskLists(...taskLists) {
  const merged = [];
  const seen = new Set();
  for (const taskList of taskLists) {
    for (const task of taskList || []) {
      const key = buildTaskReminderKey(task);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push(task);
    }
  }
  return merged;
}

function buildTaskReminderKey(task) {
  return `${task?.task_id || task?.task_name || "task"}|${task?.due_at || ""}`;
}

function shouldSendDueNowReminder(dueAt, now, quietStartedAt) {
  const dueTime = dueAt.getTime();
  const nowTime = now.getTime();
  if (dueTime <= nowTime && dueTime >= nowTime - dueNowCatchupGraceMs) {
    return true;
  }
  if (!quietStartedAt) {
    return false;
  }
  const quietTime = quietStartedAt.getTime();
  return dueTime >= quietTime && dueTime <= nowTime;
}

function lowStockItemKey(item) {
  return String(item?.item_id || item?.item_name || "");
}

function formatLowStockItem(item) {
  const name = item?.item_name || item?.item_id || "未命名項目";
  const quantity = item?.quantity_on_hand ?? item?.quantity ?? item?.value_number;
  const unit = formatUnitLabel(item?.unit);
  if (quantity === undefined || quantity === null || quantity === "") return name;
  if (Number(quantity) === 0) return `${name}，而家見底`;
  const formattedQuantity = formatDisplayNumber(quantity);
  if (String(item?.unit || "").toLowerCase() === "percent") return `${name}，而家剩返 ${formattedQuantity}%`;
  return `${name}，而家剩返 ${formattedQuantity}${unit ? ` ${unit}` : ""}`;
}

function formatTaskLine(task, timezone) {
  const name = task?.task_name || task?.task_id || "未命名 task";
  const dueText = formatLocalDateTime(task?.due_at, timezone);
  return `${name}，時間係 ${dueText}`;
}

function formatTaskWithHints(task, taskContextHints, timezone, now, { limit = 2 } = {}) {
  const lines = [`- ${formatTaskLine(task, timezone)}`];
  const hintTexts = collectTaskHintTexts(task, taskContextHints, now, { limit });
  for (const hintText of hintTexts) {
    lines.push(`  提示：${hintText}`);
  }
  return lines;
}

function collectTaskHintTexts(task, taskContextHints, now, { limit = 2 } = {}) {
  const ordered = [];
  const seen = new Set();

  for (const taskHint of extractTaskSpecificHints(task?.remarks)) {
    const normalized = normalizeHintText(taskHint);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    ordered.push(taskHint.trim());
    if (ordered.length >= limit) return ordered;
  }

  const reusableHints = (taskContextHints || [])
    .filter((hint) => taskContextHintMatchesTask(hint, task, now))
    .sort(compareTaskContextHints);

  for (const hint of reusableHints) {
    const text = String(hint?.hint_text || "").trim();
    const normalized = normalizeHintText(text);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    ordered.push(text);
    if (ordered.length >= limit) break;
  }

  return ordered;
}

function extractTaskSpecificHints(remarks) {
  const source = String(remarks || "").trim();
  if (!source) return [];
  const matches = [...source.matchAll(/(?:^|[\n;；])\s*(?:提醒|提示)\s*[：:]\s*([^\n;；]+)/gu)];
  return matches.map((match) => String(match[1] || "").trim()).filter(Boolean);
}

function taskContextHintMatchesTask(hint, task, now) {
  if (!hint || String(hint.status || "active") !== "active") return false;
  if (!hintWindowMatches(hint, now)) return false;
  if (!matchesHintField(task?.category, hint?.applies_to_category)) return false;
  if (!matchesHintField(task?.owner_person_id, hint?.applies_to_owner_person_id)) return false;
  if (!matchesHintField(task?.related_person_id, hint?.applies_to_related_person_id)) return false;

  const haystack = buildTaskHintHaystack(task);
  if (!matchesKeywordPattern(haystack, hint?.applies_to_keywords)) return false;
  if (!matchesKeywordPattern(haystack, hint?.applies_to_location_keywords)) return false;
  return true;
}

function hintWindowMatches(hint, now) {
  const validFrom = parseHintDateBoundary(hint?.valid_from, false);
  const validTo = parseHintDateBoundary(hint?.valid_to, true);
  if (validFrom && now < validFrom) return false;
  if (validTo && now > validTo) return false;
  return true;
}

function parseHintDateBoundary(value, endOfDay) {
  const text = String(value || "").trim();
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return new Date(`${text}T${endOfDay ? "23:59:59" : "00:00:00"}+08:00`);
  }
  return parseTimestamp(text);
}

function matchesHintField(taskValue, hintValue) {
  const expected = String(hintValue || "").trim();
  if (!expected) return true;
  return String(taskValue || "").trim() === expected;
}

function matchesKeywordPattern(haystack, pattern) {
  const text = String(pattern || "").trim();
  if (!text) return true;
  const keywords = text.split("|").map((entry) => entry.trim().toLowerCase()).filter(Boolean);
  if (keywords.length === 0) return true;
  return keywords.some((keyword) => haystack.includes(keyword));
}

function buildTaskHintHaystack(task) {
  return [
    task?.task_name,
    task?.description,
    task?.remarks,
    task?.category,
  ].map((value) => String(value || "").trim().toLowerCase()).join(" ");
}

function compareTaskContextHints(left, right) {
  const leftPriority = Number(left?.priority || 0);
  const rightPriority = Number(right?.priority || 0);
  if (leftPriority !== rightPriority) return rightPriority - leftPriority;
  const leftUpdated = parseTimestamp(left?.updated_at)?.getTime() || 0;
  const rightUpdated = parseTimestamp(right?.updated_at)?.getTime() || 0;
  return rightUpdated - leftUpdated;
}

function normalizeHintText(value) {
  return String(value || "").trim().toLowerCase();
}

function formatLocalDateTime(value, timezone) {
  const date = parseTimestamp(value);
  if (!date) return "未提供時間";
  const parts = zonedDateParts(date, timezone);
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)} ${pad2(parts.hour)}:${pad2(parts.minute)}`;
}

function zonedDateParts(date, timezone) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const byType = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return {
    year: Number(byType.year),
    month: Number(byType.month),
    day: Number(byType.day),
    hour: Number(byType.hour),
    minute: Number(byType.minute),
    second: Number(byType.second),
  };
}

function hasReachedTime(localNow, hhmm) {
  const [hour, minute] = parseHourMinute(hhmm);
  return localNow.hour > hour || (localNow.hour === hour && localNow.minute >= minute);
}

function isInsideQuietHours(now, timezone, quietHours) {
  if (!quietHours?.enabled) return false;
  const local = zonedDateParts(now, timezone);
  const currentMinute = local.hour * 60 + local.minute;
  const [startHour, startMinute] = parseHourMinute(quietHours.start);
  const [endHour, endMinute] = parseHourMinute(quietHours.end);
  const startTotal = startHour * 60 + startMinute;
  const endTotal = endHour * 60 + endMinute;
  if (startTotal === endTotal) return false;
  if (startTotal < endTotal) return currentMinute >= startTotal && currentMinute < endTotal;
  return currentMinute >= startTotal || currentMinute < endTotal;
}

function parseHourMinute(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || "").trim());
  if (!match) return [23, 0];
  return [Math.max(0, Math.min(23, Number(match[1]))), Math.max(0, Math.min(59, Number(match[2])))];
}

function parseTimestamp(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function pruneSentKeys(recipientState, now) {
  const cutoff = now.getTime() - 14 * 86400000;
  for (const [key, value] of Object.entries(recipientState.sent_keys || {})) {
    const date = parseTimestamp(value);
    if (!date || date.getTime() < cutoff) {
      delete recipientState.sent_keys[key];
    }
  }
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

function readJsonFile(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJsonFile(filePath, value) {
  ensureParentDirectory(filePath);
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not configured for reminder worker.`);
  }
  return value;
}

function acquireProcessLock() {
  try {
    const handle = fs.openSync(lockPath, "wx");
    fs.writeFileSync(handle, `${process.pid}\n${new Date().toISOString()}\n`, "utf8");
    fs.closeSync(handle);
  } catch (error) {
    if (error.code === "EEXIST") {
      const stale = readStaleLock(lockPath);
      if (stale) {
        fs.unlinkSync(lockPath);
        acquireProcessLock();
        return;
      }
      throw new Error("Reminder worker is already running.");
    }
    throw error;
  }
}

function releaseProcessLock() {
  try {
    fs.unlinkSync(lockPath);
  } catch {
    // Ignore.
  }
}

function readStaleLock(filePath) {
  try {
    const text = fs.readFileSync(filePath, "utf8");
    const lines = text.trim().split(/\r?\n/);
    const startedAt = parseTimestamp(lines[1] || "");
    if (!startedAt) return false;
    return Date.now() - startedAt.getTime() > 10 * 60000;
  } catch {
    return false;
  }
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

function logActivity(event, fields = {}) {
  ensureParentDirectory(activityLogPath);
  fs.appendFileSync(activityLogPath, `${JSON.stringify({
    timestamp: new Date().toISOString(),
    event,
    ...fields,
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

function redact(text) {
  return String(text)
    .replace(/(FAMILY_OS_API_KEY=)[^\s]+/gi, "$1[redacted]")
    .replace(/(TELEGRAM_BOT_TOKEN=)[^\s]+/gi, "$1[redacted]")
    .replace(/([?&]key=)[^&\s]+/gi, "$1[redacted]");
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatDisplayNumber(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return String(value);
  if (Number.isInteger(numeric)) return String(numeric);
  return numeric.toFixed(2).replace(/\.?0+$/, "");
}

function formatUnitLabel(unit) {
  const normalized = String(unit || "").trim().toLowerCase();
  const labels = {
    pack: "包",
    packs: "包",
    piece: "件",
    pieces: "件",
    bottle: "支",
    bottles: "支",
    box: "盒",
    boxes: "盒",
    roll: "卷",
    rolls: "卷",
    cup: "杯",
    cups: "杯",
    percent: "%",
  };
  return labels[normalized] || String(unit || "").trim();
}

function normalizeStringList(values) {
  const input = Array.isArray(values) ? values : [values];
  const seen = new Set();
  const output = [];
  for (const value of input) {
    const text = String(value || "").trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    output.push(text);
  }
  return output;
}

function firstNonEmptyString(...values) {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) return text;
  }
  return "";
}

function runSelfTest() {
  const now = new Date("2026-06-04T09:30:00+08:00");
  const config = {
    timezone: "Asia/Hong_Kong",
    recipients: [
      normalizeRecipientConfig({
        enabled: true,
        name: "owner",
        telegram_user_id: "1",
        chat_id: "1",
        person_scope: {
          primary_person_id: "per_husband",
          owner_person_ids: ["per_husband"],
          related_person_ids: ["per_husband", "per_wife", "per_baby"],
        },
        quiet_hours: { enabled: false },
        preferences: {
          low_stock_mode: "instant",
          task_due_now: true,
          task_due_24h: true,
          task_due_2h: true,
          daily_digest: { enabled: true, time: "09:00", task_window_hours: 24 },
        },
      }),
    ],
  };
  const state = { version: 1, recipients: {} };
  const snapshot = {
    lowStockItems: [
      { item_id: "itm_sugar", item_name: "砂糖", quantity_on_hand: 0, unit: "pack" },
    ],
    upcomingTasks: [
      { task_id: "task_1", task_name: "買奶粉", due_at: "2026-06-04 10:30:00+08:00", category: "home" },
      { task_id: "task_2", task_name: "產檢", due_at: "2026-06-05 08:30:00+08:00", category: "family" },
    ],
  };
  const plan = buildReminderPlan(config, state, snapshot, now);
  if (plan.length !== 1) throw new Error("Expected one recipient plan.");
  if (plan[0].messages.length < 2) throw new Error("Expected low-stock and task reminder messages.");
  if (!plan[0].messages.join("\n").includes("砂糖")) throw new Error("Expected low-stock item in reminder text.");
  if (!plan[0].messages.join("\n").includes("買奶粉")) throw new Error("Expected task reminder text.");

  const dueNowPlan = buildReminderPlan(config, { version: 1, recipients: {} }, {
    lowStockItems: [],
    upcomingTasks: [
      { task_id: "task_due_now", task_name: "交表", due_at: "2026-06-04 09:28:00+08:00", category: "home" },
    ],
  }, now);
  if (!dueNowPlan[0]?.messages?.join("\n").includes("而家到鐘")) {
    throw new Error("Expected due-now reminder text.");
  }

  const quietDueNowPlan = buildReminderPlan(config, { version: 1, recipients: {} }, {
    lowStockItems: [],
    upcomingTasks: [
      { task_id: "task_quiet_due_now", task_name: "夜晚飲水", due_at: "2026-06-04 23:28:00+08:00", category: "home" },
    ],
  }, new Date("2026-06-04T23:30:00+08:00"));
  if (!quietDueNowPlan[0]?.messages?.join("\n").includes("而家到鐘")) {
    throw new Error("Expected due-now reminder to bypass quiet hours.");
  }

  const dedupePlan = buildReminderPlan(config, { version: 1, recipients: {} }, {
    lowStockItems: [],
    upcomingTasks: [
      { task_id: "task_same_run", task_name: "覆診", due_at: "2026-06-05 08:30:00+08:00", category: "family" },
    ],
  }, now);
  const dedupeText = dedupePlan[0]?.messages?.join("\n") || "";
  if (!dedupeText.includes("已經另外提咗你")) {
    throw new Error("Expected digest de-duplication note.");
  }

  const hintPlan = buildReminderPlan(config, { version: 1, recipients: {} }, {
    lowStockItems: [],
    upcomingTasks: [
      {
        task_id: "task_hint",
        task_name: "產檢",
        description: "去醫院產檢",
        due_at: "2026-06-04 10:30:00+08:00",
        category: "medical",
        related_person_id: "per_wife",
        remarks: "提醒：記得帶文件",
      },
    ],
    taskContextHints: [
      {
        hint_id: "hint_mask",
        status: "active",
        hint_text: "記得戴口罩",
        applies_to_category: "medical",
        applies_to_keywords: "產檢|醫院|診所",
        applies_to_related_person_id: "per_wife",
        priority: 50,
      },
      {
        hint_id: "hint_water",
        status: "active",
        hint_text: "記得帶水樽",
        applies_to_category: "medical",
        applies_to_related_person_id: "per_wife",
        priority: 40,
      },
    ],
  }, now);
  const hintText = hintPlan[0]?.messages?.join("\n") || "";
  if (!hintText.includes("提示：記得帶文件")) {
    throw new Error("Expected task-specific reminder hint in task reminder text.");
  }
  if (!hintText.includes("提示：記得戴口罩")) {
    throw new Error("Expected reusable or task-specific mask hint in task reminder text.");
  }
  if (hintText.indexOf("提示：記得戴口罩") !== hintText.lastIndexOf("提示：記得戴口罩")) {
    throw new Error("Expected duplicate task and reusable hints to be de-duplicated.");
  }

  const allClearPlan = buildReminderPlan(config, { version: 1, recipients: {} }, {
    lowStockItems: [],
    upcomingTasks: [],
  }, now);
  if (!allClearPlan[0]?.messages?.join("\n").includes("冇特別要跟進")) {
    throw new Error("Expected all-clear daily digest.");
  }

  const personalizedConfig = {
    timezone: "Asia/Hong_Kong",
    recipients: [
      normalizeRecipientConfig({
        enabled: true,
        name: "owner",
        telegram_user_id: "1",
        chat_id: "1",
        person_scope: {
          primary_person_id: "per_husband",
          owner_person_ids: ["per_husband"],
          related_person_ids: ["per_husband", "per_wife", "per_baby"],
        },
        quiet_hours: { enabled: false },
        preferences: {
          task_due_now: true,
          task_due_24h: true,
          daily_digest: { enabled: false },
        },
      }),
      normalizeRecipientConfig({
        enabled: true,
        name: "wife",
        telegram_user_id: "2",
        chat_id: "2",
        person_scope: {
          primary_person_id: "per_wife",
          owner_person_ids: ["per_wife"],
          related_person_ids: ["per_wife", "per_baby"],
        },
        quiet_hours: { enabled: false },
        preferences: {
          task_due_now: true,
          task_due_24h: true,
          daily_digest: { enabled: false },
        },
      }),
    ],
  };
  const personalizedPlan = buildReminderPlan(personalizedConfig, { version: 1, recipients: {} }, {
    lowStockItems: [],
    upcomingTasks: [
      {
        task_id: "task_owner_only",
        task_name: "飲水",
        due_at: "2026-06-05 08:30:00+08:00",
        category: "home",
        owner_person_id: "per_husband",
        related_person_id: "per_husband",
      },
      {
        task_id: "task_baby_shared",
        task_name: "BB 打針",
        due_at: "2026-06-05 09:00:00+08:00",
        category: "medical",
        related_person_id: "per_baby",
      },
    ],
  }, now);
  if (personalizedPlan.length !== 2) {
    throw new Error("Expected personalized reminders for two recipients.");
  }
  const ownerText = personalizedPlan.find((entry) => entry.recipient.name === "owner")?.messages?.join("\n") || "";
  const wifeText = personalizedPlan.find((entry) => entry.recipient.name === "wife")?.messages?.join("\n") || "";
  if (!ownerText.includes("飲水")) {
    throw new Error("Expected owner-only task to reach owner.");
  }
  if (wifeText.includes("飲水")) {
    throw new Error("Did not expect owner-only task to reach wife.");
  }
  if (!ownerText.includes("BB 打針") || !wifeText.includes("BB 打針")) {
    throw new Error("Expected baby-related task to reach both configured recipients.");
  }

  const quiet = isInsideQuietHours(now, "Asia/Hong_Kong", { enabled: true, start: "23:00", end: "07:00" });
  if (quiet) throw new Error("Quiet-hours calculation is wrong.");
  console.log("Family OS reminder worker self-test passed.");
}
