import fs from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { Codex } from "@openai/codex-sdk";
import { ensureParentDirectory, ensureRuntimeDirectories, resolveFamilyOsPaths } from "./instance_paths.mjs";
import { loadFamilyOsPersona } from "./persona_config.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const runtimePaths = resolveFamilyOsPaths();
ensureRuntimeDirectories(runtimePaths);
const persona = loadFamilyOsPersona();
const defaultWorkspace = runtimePaths.workspaceRoot;
const defaultStatePath = runtimePaths.bridgeStatePath;
const bridgeErrorLogPath = runtimePaths.bridgeErrorLogPath;
const defaultRuntimeConfigPath = runtimePaths.runtimeConfigPath;
const defaultReminderConfigPath = runtimePaths.reminderConfigPath;
const bundledCodexPath = path.join(
  scriptDir,
  "node_modules",
  "@openai",
  "codex-win32-x64",
  "vendor",
  "x86_64-pc-windows-msvc",
  "bin",
  "codex.exe",
);
const callbackChoiceTtlMs = 30 * 60 * 1000;
const pendingClarificationTtlMs = 30 * 60 * 1000;
const maxBridgeExecutionSteps = 6;
const maxRecentTranscriptEntries = 20;
const transcriptSessionGapMs = 15 * 60 * 1000;

const defaultRuntimeConfig = {
  plugin_name: "family-os-bb-inventory",
  primary_skill_root: path.join("plugins-staging", "family-os-bb-inventory", "skills", "family-os-bb-inventory"),
  api_skill_root: path.join("plugins-staging", "family-os-bb-inventory", "skills", "family-os-bb-inventory-api"),
  skill_names: ["family-os-bb-inventory", "family-os-bb-inventory-api"],
  runtime_knowledge_root: path.join("plugins-staging", "family-os-bb-inventory", "runtime"),
  relative_config_path: path.join("plugins-staging", "family-os-bb-inventory", "runtime", "telegram-runtime.json"),
  bridge_commands: {
    bb_inventory_api: {
      runner: "node",
      path: path.join(
        "plugins-staging",
        "family-os-bb-inventory",
        "skills",
        "family-os-bb-inventory-api",
        "scripts",
        "family_os_bb_inventory_api_client.mjs",
      ),
      node_args: ["--use-system-ca"],
    },
    runtime_learning: {
      runner: "node",
      path: path.join(
        "plugins-staging",
        "family-os-bb-inventory",
        "skills",
        "family-os-bb-inventory",
        "scripts",
        "manage_runtime_learning.mjs",
      ),
      node_args: [],
    },
    inventory_unit_preflight: {
      runner: "node",
      path: path.join(
        "plugins-staging",
        "family-os-bb-inventory",
        "skills",
        "family-os-bb-inventory",
        "scripts",
        "inventory_unit_preflight.mjs",
      ),
      node_args: ["--use-system-ca"],
    },
  },
  references: {
    bb_log_templates: path.join("plugins-staging", "family-os-bb-inventory", "skills", "family-os-bb-inventory", "references", "bb-log-templates.md"),
    inventory_flows: path.join("plugins-staging", "family-os-bb-inventory", "skills", "family-os-bb-inventory", "references", "inventory-flows.md"),
    task_management: path.join("plugins-staging", "family-os-bb-inventory", "skills", "family-os-bb-inventory", "references", "task-management.md"),
    household_memory: path.join("plugins-staging", "family-os-bb-inventory", "skills", "family-os-bb-inventory", "references", "household-memory.md"),
    unit_normalization: path.join("plugins-staging", "family-os-bb-inventory", "skills", "family-os-bb-inventory", "references", "unit-normalization.md"),
    ambiguity_policy: path.join("plugins-staging", "family-os-bb-inventory", "skills", "family-os-bb-inventory", "references", "ambiguity-policy.md"),
    self_enhance_policy: path.join("plugins-staging", "family-os-bb-inventory", "skills", "family-os-bb-inventory", "references", "self-enhance-policy.md"),
  },
};

export class CodexBridge {
  constructor({
    workspace = process.env.FAMILY_OS_WORKSPACE || defaultWorkspace,
    statePath = defaultStatePath,
    runtimeConfigPath = defaultRuntimeConfigPath,
    reminderConfigPath = defaultReminderConfigPath,
    timeoutMs = Number(process.env.FAMILY_OS_CODEX_TIMEOUT_MS || 150000),
  } = {}) {
    this.workspace = path.resolve(workspace);
    this.statePath = path.resolve(statePath);
    this.runtimeConfigPath = path.resolve(runtimeConfigPath);
    this.reminderConfigPath = path.resolve(reminderConfigPath);
    this.skillsRoot = path.resolve(process.env.FAMILY_OS_SKILLS_ROOT || path.join(this.workspace, ".agents", "skills"));
    this.timeoutMs = timeoutMs;
    this.codex = new Codex();
    this.runtimeConfig = readRuntimeConfig(this.runtimeConfigPath);
    this.reminderRecipientMap = readReminderRecipientMap(this.reminderConfigPath);
    this.persona = persona;
    this.runtimeKnowledgeRoot = path.resolve(this.workspace, this.runtimeConfig.runtime_knowledge_root);
    this.bridgeCommands = Object.fromEntries(
      Object.entries(this.runtimeConfig.bridge_commands).map(([commandId, commandDef]) => [
        commandId,
        {
          ...commandDef,
          command_id: commandId,
          node_args: Array.isArray(commandDef?.node_args)
            ? commandDef.node_args.map((entry) => String(entry || "")).filter(Boolean)
            : [],
          absolutePath: path.resolve(this.workspace, commandDef.path),
        },
      ]),
    );
    this.state = normalizeBridgeState(readJsonFile(this.statePath, {}));
  }

  health({ requireLogin = true } = {}) {
    const login = readCodexLoginStatus();
    const codexHome = process.env.CODEX_HOME
      ? path.resolve(process.env.CODEX_HOME)
      : path.join(os.homedir(), ".codex");
    const checks = {
      codex_login: login.message,
      desktop_auth_cache: fs.existsSync(path.join(codexHome, "auth.json")),
      workspace: fs.existsSync(this.workspace),
      agents_md: fs.existsSync(path.join(this.workspace, "AGENTS.md")),
      runtime_config: fs.existsSync(this.runtimeConfigPath),
      runtime_knowledge_root: fs.existsSync(this.runtimeKnowledgeRoot),
      skills: Object.fromEntries(this.runtimeConfig.skill_names.map((name) => [
        name,
        fs.existsSync(path.join(this.skillsRoot, name, "SKILL.md")),
      ])),
      references: Object.fromEntries(Object.entries(this.runtimeConfig.references).map(([name, relativePath]) => [
        name,
        fs.existsSync(path.resolve(this.workspace, relativePath)),
      ])),
      command_targets: Object.fromEntries(Object.entries(this.bridgeCommands).map(([commandId, commandDef]) => [
        commandId,
        fs.existsSync(commandDef.absolutePath),
      ])),
    };
    const ok = (!requireLogin || login.ok)
      && checks.workspace
      && checks.agents_md
      && checks.runtime_config
      && checks.runtime_knowledge_root
      && Object.values(checks.skills).every(Boolean)
      && Object.values(checks.references).every(Boolean)
      && Object.values(checks.command_targets).every(Boolean);
    return {
      ok,
      workspace: this.workspace,
      auth_mode: "codex_login",
      runtime_config_path: this.runtimeConfig.relative_config_path,
      checks,
    };
  }

  reset(chatId) {
    delete this.state.chats[String(chatId)];
    this.saveState();
  }

  async run(chatId, userText, { telegramUserId = "" } = {}) {
    const health = this.health();
    if (!health.ok) {
      throw new Error("Codex Bridge is not ready. Sign in to Codex in this Windows session and sync the BB + inventory + task V2 skills.");
    }
    const stateKey = String(chatId);
    const chatState = this.getChatState(stateKey, true);
    const normalizedUserText = String(userText || "").trim();
    const resumeContext = getPendingClarificationContext(chatState);
    return this.runChatTurn(stateKey, normalizedUserText, telegramUserId, {
      clearPending: false,
      resumeContext,
    });
  }

  async resumeFromCallback(chatId, callbackId, { telegramUserId = "" } = {}) {
    const stateKey = String(chatId);
    const chatState = this.getChatState(stateKey, false);
    if (!chatState) {
      return {
        text: `${persona.firstPersonStyle}唔記得上次嗰個追問喇，請再講一次。`,
        clear_inline_keyboard: true,
      };
    }

    pruneChatState(chatState);
    const choice = (chatState.pending_choices || []).find((entry) => entry.token === callbackId);
    if (!choice) {
      chatState.pending_choices = [];
      chatState.updated_at = new Date().toISOString();
      this.saveState();
      return {
        text: `${persona.firstPersonStyle}搵唔返之前嗰個選項喇，請再講一次。`,
        clear_inline_keyboard: true,
      };
    }

    chatState.pending_choices = [];
    chatState.pending_clarification = null;
    chatState.updated_at = new Date().toISOString();
    this.saveState();

    const result = await this.runChatTurn(stateKey, choice.resume_text, telegramUserId, {
      clearPending: false,
      transcriptUserText: `[button] ${choice.label}`,
    });
    return {
      ...result,
      clear_inline_keyboard: true,
    };
  }

  async runChatTurn(
    stateKey,
    userText,
    telegramUserId,
    {
      clearPending = true,
      retrying = false,
      resumeContext = null,
      transcriptUserText = null,
    } = {},
  ) {
    const chatState = this.getChatState(stateKey, true);
    if (clearPending) {
      chatState.pending_choices = [];
      chatState.pending_clarification = null;
    }
    const thread = chatState.thread_id
      ? this.codex.resumeThread(chatState.thread_id, this.threadOptions())
      : this.codex.startThread(this.threadOptions());

    try {
      const envelope = await this.runBridgeTurnLoop(thread, userText, telegramUserId, chatState, resumeContext);
      if (thread.id) {
        chatState.thread_id = thread.id;
      }
      applySuccessfulTurnContext(chatState, envelope, userText);
      const reply = this.buildBridgeReply(chatState, envelope, { sourceUserText: userText });
      appendRecentTranscript(chatState, "user", transcriptUserText || userText);
      appendRecentTranscript(chatState, "assistant", reply.text);
      chatState.updated_at = new Date().toISOString();
      this.saveState();
      return reply;
    } catch (error) {
      if (!retrying && chatState.thread_id && shouldRetryWithFreshThread(error)) {
        chatState.thread_id = "";
        chatState.pending_choices = [];
        chatState.pending_clarification = null;
        chatState.updated_at = new Date().toISOString();
        this.saveState();
        return this.runChatTurn(stateKey, userText, telegramUserId, {
          clearPending,
          retrying: true,
          resumeContext,
        });
      }
      appendBridgeErrorLog(error, {
        chat_id: stateKey,
        telegram_user_id: telegramUserId || "",
        user_text: userText,
      });
      throw error;
    }
  }

  async runBridgeTurnLoop(thread, userText, telegramUserId, chatState, resumeContext = null) {
    let prompt = this.buildFamilyOsAgentPrompt(userText, telegramUserId, chatState, resumeContext);
    let latestSuccessfulExecution = null;
    const successfulExecutions = [];
    const executionHistory = [];

    for (let step = 0; step < maxBridgeExecutionSteps; step += 1) {
      const response = await this.runStructuredTurnWithTimeout(
        thread,
        prompt,
        bridgeEnvelopeSchema(this.runtimeConfig),
      );
      const envelope = parseBridgeEnvelope(response.finalResponse);
      if (envelope.status !== "execute") {
        return {
          ...envelope,
          latest_successful_execution: latestSuccessfulExecution,
          successful_executions: successfulExecutions,
        };
      }

      const execution = this.executeBridgeCommand(envelope.command_request);
      executionHistory.push({
        command_request: envelope.command_request,
        execution,
      });
      if (execution.ok) {
        latestSuccessfulExecution = {
          command_request: envelope.command_request,
          execution,
        };
        successfulExecutions.push(latestSuccessfulExecution);
      }
      prompt = this.buildExecutionFollowupPrompt({
        userText,
        telegramUserId,
        commandRequest: envelope.command_request,
        execution,
      });
    }

    return buildBridgeStepLimitFallbackEnvelope({
      userText,
      executionHistory,
      successfulExecutions,
      latestSuccessfulExecution,
    });
  }

  async runStructuredTurnWithTimeout(thread, prompt, outputSchema) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const itemsById = new Map();
    let finalResponse = "";
    let usage = null;

    try {
      const { events } = await thread.runStreamed(prompt, {
        signal: controller.signal,
        outputSchema,
      });

      for await (const event of events) {
        if (event.type === "turn.failed") {
          throw new Error(event.error?.message || "Codex bridge structured turn failed.");
        }
        if (event.type === "error") {
          throw new Error(event.message || "Codex bridge structured stream failed.");
        }
        if (event.type === "turn.completed") {
          usage = event.usage || null;
          continue;
        }
        if (!("item" in event) || !event.item) {
          continue;
        }

        const item = event.item;
        itemsById.set(item.id, item);

        const boundary = validateBridgeTurnItem(item, {
          runtimeKnowledgeRoot: this.runtimeKnowledgeRoot,
          workspace: this.workspace,
        });
        if (!boundary.ok) {
          controller.abort();
          throw new Error(boundary.error);
        }
        if (item.type === "agent_message" && typeof item.text === "string") {
          finalResponse = item.text;
        }
      }

      return {
        finalResponse,
        usage,
        items: Array.from(itemsById.values()),
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  threadOptions() {
    return {
      model: "gpt-5.4",
      workingDirectory: this.workspace,
      skipGitRepoCheck: true,
      sandboxMode: "workspace-write",
      approvalPolicy: "never",
      networkAccessEnabled: true,
      webSearchMode: "disabled",
      modelReasoningEffort: "medium",
    };
  }

  buildFamilyOsAgentPrompt(userText, telegramUserId, chatState, resumeContext = null) {
    const promptContext = this.readRuntimePromptContext();
    const bridgeCommands = Object.values(this.bridgeCommands)
      .map((commandDef) => `- ${commandDef.command_id}: runner=${commandDef.runner}, path=${commandDef.path}`)
      .join("\n");
    const localTimeBlock = buildLocalTimePromptBlock();
    const senderIdentityBlock = buildSenderIdentityPromptBlock(this.reminderRecipientMap[String(telegramUserId || "")] || null);
    const recentChatContextBlock = buildRecentChatContextPromptBlock(chatState, userText);
    const transcriptContextBlock = buildTranscriptContextPromptBlock(chatState);
    const pendingClarificationBlock = buildPendingClarificationPromptBlock(resumeContext);

    return [
      "This message comes from the allowlisted private Family OS Telegram bridge.",
      "The bridge is transport plus generic runtime-command brokerage only. It does not contain domain rules.",
      "Load and follow AGENTS.md, the active runtime config, and the synced BB + inventory + task skills.",
      `Active runtime config: ${this.runtimeConfig.relative_config_path}`,
      `Active skills: ${this.runtimeConfig.skill_names.map((name) => `$${name}`).join(", ")}`,
      `Primary skill root: ${this.runtimeConfig.primary_skill_root}`,
      `API skill root: ${this.runtimeConfig.api_skill_root}`,
      `Runtime knowledge root: ${this.runtimeConfig.runtime_knowledge_root}`,
      "Do not run local commands inside the model turn. The bridge will execute configured runtime commands for you if you return status=execute.",
      "Do not use MCP tools.",
      "Do not use web search.",
      "Do not edit files outside the runtime knowledge root.",
      "When you need a configured helper command, return status=execute with one command_request.",
      "Allowed runtime commands:",
      bridgeCommands,
      "Use status=reply, status=clarify, or status=desktop_required only when you are ready for a user-facing answer.",
      `Use Cantonese and a humble household-helper tone in reply_text only. When speaking in first person, use "${this.persona.firstPersonStyle}".`,
      `Telegram user ID: ${telegramUserId || ""}`,
      ...(senderIdentityBlock ? ["", senderIdentityBlock] : []),
      "",
      localTimeBlock,
      "",
      "Current runtime knowledge:",
      promptContext.learnedKnowledge,
      "",
      "Current unresolved learning conflicts:",
      promptContext.learningConflicts,
      "",
      "Reference: bb-log-templates.md",
      promptContext.references.bb_log_templates,
      "",
      "Reference: inventory-flows.md",
      promptContext.references.inventory_flows,
      "",
      "Reference: task-management.md",
      promptContext.references.task_management,
      "",
      "Reference: household-memory.md",
      promptContext.references.household_memory,
      "",
      "Reference: unit-normalization.md",
      promptContext.references.unit_normalization,
      "",
      "Reference: ambiguity-policy.md",
      promptContext.references.ambiguity_policy,
      "",
      "Reference: self-enhance-policy.md",
      promptContext.references.self_enhance_policy,
      ...(transcriptContextBlock ? ["", transcriptContextBlock] : []),
      ...(recentChatContextBlock ? ["", recentChatContextBlock] : []),
      ...(pendingClarificationBlock ? ["", pendingClarificationBlock] : []),
      "",
      "Current Telegram user message:",
      userText,
      "",
      "Final output must be exactly one JSON object matching the schema.",
    ].join("\n");
  }

  buildExecutionFollowupPrompt({ userText, telegramUserId, commandRequest, execution }) {
    return [
      "Continue the same Telegram bridge turn.",
      "Do not run local commands yourself. If you need another configured helper command, return one more status=execute envelope.",
      "If an inventory write execution result already includes quantity_on_hand, let the final Cantonese reply explicitly mention the remaining stock. Do this in the model reply itself, not by relying on bridge-side formatting.",
      `Telegram user ID: ${telegramUserId || ""}`,
      "",
      "Original Telegram user message:",
      userText,
      "",
      "The bridge executed this runtime command for you:",
      JSON.stringify(commandRequest, null, 2),
      "",
      "Execution result:",
      JSON.stringify(execution, null, 2),
      "",
      "Now decide the next step and return exactly one JSON object matching the schema.",
    ].join("\n");
  }

  buildBridgeReply(chatState, envelope, { sourceUserText = "" } = {}) {
    if (envelope.status === "clarify") {
      const question = envelope.clarification?.question
        || envelope.reply_text
        || `${persona.firstPersonStyle}想再問清楚一點，可以補充嗎？`;
      const choices = Array.isArray(envelope.clarification?.choices) ? envelope.clarification.choices : [];
      const pendingChoices = [];
      for (const choice of choices) {
        const label = String(choice?.label || "").trim();
        const resumeText = String(choice?.resume_text || "").trim();
        if (!label || !resumeText) continue;
        pendingChoices.push({
          token: `cb_${randomUUID()}`,
          label,
          resume_text: resumeText,
          created_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + callbackChoiceTtlMs).toISOString(),
        });
      }
      chatState.pending_choices = pendingChoices;
      chatState.pending_clarification = normalizePendingClarification({
        question,
        allow_free_text: envelope.clarification?.allow_free_text !== false,
        original_user_text: sourceUserText,
        last_reply_text: envelope.reply_text || question,
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + pendingClarificationTtlMs).toISOString(),
      });
      return {
        text: question,
        reply_markup: pendingChoices.length > 0 ? buildInlineKeyboard(pendingChoices) : null,
      };
    }

    chatState.pending_choices = [];
    chatState.pending_clarification = null;
    return {
      text: envelope.reply_text,
      reply_markup: null,
    };
  }

  executeBridgeCommand(commandRequest) {
    const normalized = normalizeCommandRequest(commandRequest);
    const commandDef = this.bridgeCommands[normalized.command_id];
    if (!commandDef) {
      return {
        ok: false,
        command_id: normalized.command_id,
        error: "Unknown runtime command id.",
      };
    }

    const startedAt = new Date().toISOString();
    const result = commandDef.runner === "node"
      ? runNodeRuntimeCommand(this.workspace, commandDef.absolutePath, normalized.argv, this.timeoutMs, commandDef.node_args)
      : runCmdRuntimeCommand(this.workspace, commandDef.absolutePath, normalized.argv, this.timeoutMs);

    return {
      ok: result.ok,
      command_id: normalized.command_id,
      runner: commandDef.runner,
      path: commandDef.path,
      argv: normalized.argv,
      node_args: commandDef.runner === "node" ? commandDef.node_args : undefined,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      exit_code: result.exit_code,
      stdout: result.stdout,
      stderr: result.stderr,
      parsed_json: result.parsed_json,
      error: result.error,
    };
  }

  readRuntimePromptContext() {
    const learnedKnowledgePath = path.resolve(this.workspace, this.runtimeConfig.runtime_knowledge_root, "learned-knowledge.json");
    const learningConflictsPath = path.resolve(this.workspace, this.runtimeConfig.runtime_knowledge_root, "learning-conflicts.json");
    return {
      learnedKnowledge: safeReadTextFile(learnedKnowledgePath),
      learningConflicts: safeReadTextFile(learningConflictsPath),
      references: Object.fromEntries(Object.entries(this.runtimeConfig.references).map(([key, relativePath]) => [
        key,
        safeReadTextFile(path.resolve(this.workspace, relativePath)),
      ])),
    };
  }

  getChatState(chatKey, createIfMissing) {
    let chatState = this.state.chats[chatKey];
    if (!chatState && createIfMissing) {
      chatState = normalizeChatState({});
      this.state.chats[chatKey] = chatState;
    }
    if (chatState) {
      pruneChatState(chatState);
    }
    return chatState || null;
  }

  saveState() {
    ensureParentDirectory(this.statePath);
    fs.writeFileSync(this.statePath, `${JSON.stringify(this.state, null, 2)}\n`, "utf8");
  }
}

function bridgeEnvelopeSchema(runtimeConfig) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["status", "reply_text", "clarification", "command_request"],
    properties: {
      status: {
        type: "string",
        enum: ["reply", "clarify", "desktop_required", "execute"],
      },
      reply_text: {
        type: "string",
      },
      clarification: {
        anyOf: [
          { type: "null" },
          {
            type: "object",
            additionalProperties: false,
            required: ["question", "choices", "allow_free_text"],
            properties: {
              question: { type: "string" },
              allow_free_text: { type: "boolean" },
              choices: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["label", "resume_text"],
                  properties: {
                    label: { type: "string" },
                    resume_text: { type: "string" },
                  },
                },
              },
            },
          },
        ],
      },
      command_request: {
        anyOf: [
          { type: "null" },
          {
            type: "object",
            additionalProperties: false,
            required: ["command_id", "argv"],
            properties: {
              command_id: {
                type: "string",
                enum: Object.keys(runtimeConfig.bridge_commands),
              },
              argv: {
                type: "array",
                items: { type: "string" },
              },
            },
          },
        ],
      },
    },
  };
}

function parseBridgeEnvelope(text) {
  const parsed = JSON.parse(stripJsonFences(text));
  const status = String(parsed?.status || "").trim();
  if (!["reply", "clarify", "desktop_required", "execute"].includes(status)) {
    throw new Error("Bridge response used an invalid status.");
  }
  const envelope = {
    status,
    reply_text: String(parsed?.reply_text || "").trim(),
    clarification: null,
    command_request: null,
  };
  if (parsed?.clarification && typeof parsed.clarification === "object") {
    envelope.clarification = {
      question: String(parsed.clarification.question || "").trim(),
      allow_free_text: Boolean(parsed.clarification.allow_free_text),
      choices: Array.isArray(parsed.clarification.choices)
        ? parsed.clarification.choices.map((choice) => ({
          label: String(choice?.label || "").trim(),
          resume_text: String(choice?.resume_text || "").trim(),
        })).filter((choice) => choice.label && choice.resume_text)
        : [],
    };
  }
  if (parsed?.command_request && typeof parsed.command_request === "object") {
    envelope.command_request = normalizeCommandRequest(parsed.command_request);
  }
  if (status === "execute" && !envelope.command_request) {
    throw new Error("Bridge execute response did not include command_request.");
  }
  if (status !== "execute" && !envelope.reply_text && status !== "clarify") {
    throw new Error("Bridge response did not include reply_text.");
  }
  if (status === "clarify" && !envelope.clarification?.question) {
    throw new Error("Bridge clarification response did not include a question.");
  }
  return envelope;
}

function validateBridgeTurnItem(item, { runtimeKnowledgeRoot, workspace }) {
  const type = String(item?.type || "");

  if (type === "mcp_tool_call") {
    return { ok: false, error: "Bridge turn tried to use an MCP tool, which is not allowed." };
  }
  if (type === "web_search") {
    return { ok: false, error: "Bridge turn tried to use web search, which is not allowed." };
  }
  if (type === "command_execution") {
    return { ok: false, error: "Bridge turn tried to run a local command directly instead of using status=execute." };
  }
  if (type === "file_change") {
    const changes = Array.isArray(item?.changes) ? item.changes : [];
    const invalid = changes.find((change) => !isPathWithinRuntimeKnowledge(change?.path, runtimeKnowledgeRoot, workspace));
    if (invalid) {
      return {
        ok: false,
        error: `Bridge turn tried to edit a file outside the runtime knowledge directory: ${String(invalid?.path || "")}`,
      };
    }
  }
  return { ok: true };
}

function isPathWithinRuntimeKnowledge(changePath, runtimeKnowledgeRoot, workspace) {
  const raw = String(changePath || "").trim();
  if (!raw) return false;
  const resolved = path.resolve(workspace, raw);
  const relative = path.relative(runtimeKnowledgeRoot, resolved);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function buildInlineKeyboard(choices) {
  const rows = [];
  const normalized = Array.isArray(choices) ? choices : [];
  for (let index = 0; index < normalized.length; index += 2) {
    const row = normalized.slice(index, index + 2).map((choice) => ({
      text: choice.label,
      callback_data: choice.token,
    }));
    if (row.length > 0) rows.push(row);
  }
  return rows.length > 0 ? { inline_keyboard: rows } : null;
}

function normalizeBridgeState(value) {
  const source = value && typeof value === "object" ? value : {};
  const chats = source.chats && typeof source.chats === "object" ? source.chats : {};
  const normalized = { chats: {} };
  for (const [chatKey, chatState] of Object.entries(chats)) {
    normalized.chats[chatKey] = normalizeChatState(chatState);
  }
  return normalized;
}

function normalizeChatState(value) {
  const source = value && typeof value === "object" ? value : {};
  const migratedChoices = Array.isArray(source.pending_choices)
    ? source.pending_choices
    : Array.isArray(source.pending_clarification?.choices)
    ? source.pending_clarification.choices.map((choice) => ({
      token: String(choice?.token || ""),
      label: String(choice?.label || ""),
      resume_text: String(choice?.resume_text || choice?.value || ""),
      created_at: String(choice?.created_at || source.pending_clarification?.created_at || ""),
      expires_at: String(choice?.expires_at || ""),
    }))
    : [];
  return {
    thread_id: String(source.thread_id || ""),
    pending_choices: migratedChoices.map(normalizePendingChoice).filter(Boolean),
    pending_clarification: normalizePendingClarification(source.pending_clarification),
    recent_subject: normalizeResultEntity(source.recent_subject),
    last_successful_action: normalizeLastSuccessfulAction(source.last_successful_action),
    last_result_entities: Array.isArray(source.last_result_entities)
      ? source.last_result_entities.map(normalizeResultEntity).filter(Boolean)
      : [],
    recent_transcript: Array.isArray(source.recent_transcript)
      ? source.recent_transcript.map(normalizeTranscriptEntry).filter(Boolean).slice(-maxRecentTranscriptEntries)
      : [],
    updated_at: String(source.updated_at || ""),
  };
}

function normalizeLastSuccessfulAction(value) {
  const source = value && typeof value === "object" ? value : {};
  const actions = Array.isArray(source.actions)
    ? source.actions.map((entry) => String(entry || "").trim()).filter(Boolean)
    : [];
  if (actions.length === 0) return null;
  return {
    actions,
    source_user_text: String(source.source_user_text || "").trim(),
    created_at: String(source.created_at || "").trim() || new Date().toISOString(),
  };
}

function normalizeResultEntity(value) {
  const source = value && typeof value === "object" ? value : {};
  const kind = String(source.kind || "").trim();
  const entityId = String(source.entity_id || "").trim();
  const name = String(source.name || "").trim();
  if (!kind && !entityId && !name) return null;
  return {
    kind,
    entity_id: entityId,
    name,
    due_at: String(source.due_at || "").trim(),
    status: String(source.status || "").trim(),
    category: String(source.category || "").trim(),
    unit: String(source.unit || "").trim(),
    next_expiry_date: String(source.next_expiry_date || "").trim(),
    quantity_on_hand: source.quantity_on_hand === undefined || source.quantity_on_hand === null || source.quantity_on_hand === ""
      ? ""
      : String(source.quantity_on_hand).trim(),
    created_at: String(source.created_at || "").trim() || new Date().toISOString(),
  };
}

function normalizePendingChoice(value) {
  const choice = value && typeof value === "object" ? value : {};
  const token = String(choice.token || "").trim();
  const label = String(choice.label || "").trim();
  const resumeText = String(choice.resume_text || "").trim();
  if (!token || !label || !resumeText) return null;
  const createdAt = String(choice.created_at || "").trim() || new Date().toISOString();
  const expiresAt = String(choice.expires_at || "").trim() || new Date(Date.now() + callbackChoiceTtlMs).toISOString();
  return {
    token,
    label,
    resume_text: resumeText,
    created_at: createdAt,
    expires_at: expiresAt,
  };
}

function normalizeTranscriptEntry(value) {
  const source = value && typeof value === "object" ? value : {};
  const role = String(source.role || "").trim();
  const text = String(source.text || "").trim();
  if (!role || !text) return null;
  if (!["user", "assistant", "system"].includes(role)) return null;
  return {
    role,
    text,
    created_at: String(source.created_at || "").trim() || new Date().toISOString(),
  };
}

function pruneChatState(chatState) {
  chatState.pending_choices = (Array.isArray(chatState.pending_choices) ? chatState.pending_choices : [])
    .map(normalizePendingChoice)
    .filter((choice) => choice && !isChoiceExpired(choice));
  chatState.pending_clarification = normalizePendingClarification(chatState.pending_clarification);
  if (chatState.pending_clarification && isPendingClarificationExpired(chatState.pending_clarification)) {
    chatState.pending_clarification = null;
  }
  chatState.recent_transcript = (Array.isArray(chatState.recent_transcript) ? chatState.recent_transcript : [])
    .map(normalizeTranscriptEntry)
    .filter(Boolean)
    .slice(-maxRecentTranscriptEntries);
}

function isChoiceExpired(choice) {
  const expiresAt = Date.parse(String(choice?.expires_at || ""));
  return Number.isFinite(expiresAt) ? expiresAt <= Date.now() : false;
}

function normalizePendingClarification(value) {
  const source = value && typeof value === "object" ? value : {};
  const question = String(source.question || "").trim();
  if (!question) return null;
  const createdAt = String(source.created_at || "").trim() || new Date().toISOString();
  const expiresAt = String(source.expires_at || "").trim() || new Date(Date.now() + pendingClarificationTtlMs).toISOString();
  return {
    question,
    allow_free_text: source.allow_free_text !== false,
    original_user_text: String(source.original_user_text || "").trim(),
    last_reply_text: String(source.last_reply_text || question).trim(),
    created_at: createdAt,
    expires_at: expiresAt,
  };
}

function isPendingClarificationExpired(pendingClarification) {
  const expiresAt = Date.parse(String(pendingClarification?.expires_at || ""));
  return Number.isFinite(expiresAt) ? expiresAt <= Date.now() : false;
}

function getPendingClarificationContext(chatState) {
  const pendingClarification = normalizePendingClarification(chatState?.pending_clarification);
  if (!pendingClarification || isPendingClarificationExpired(pendingClarification)) {
    return null;
  }
  return { ...pendingClarification };
}

function appendRecentTranscript(chatState, role, text, createdAt = new Date().toISOString()) {
  const entry = normalizeTranscriptEntry({
    role,
    text,
    created_at: createdAt,
  });
  if (!entry) return;
  chatState.recent_transcript = [
    ...(Array.isArray(chatState.recent_transcript) ? chatState.recent_transcript : []),
    entry,
  ].slice(-maxRecentTranscriptEntries);
}

function buildPendingClarificationPromptBlock(resumeContext) {
  const pendingClarification = normalizePendingClarification(resumeContext);
  if (!pendingClarification) {
    return "";
  }
  return [
    "A previous clarification is still pending for this Telegram chat.",
    "The new message may be a short free-text answer to that clarification rather than a brand-new request.",
    "If the new message answers the clarification, combine it with the original request and continue from there.",
    "If the new message is clearly unrelated, treat it as a new request instead.",
    `Pending clarification question: ${pendingClarification.question}`,
    `Original Telegram user message: ${pendingClarification.original_user_text || "[unavailable]"}`,
    `Previous clarification reply shown to the user: ${pendingClarification.last_reply_text || pendingClarification.question}`,
  ].join("\n");
}

function buildTranscriptContextPromptBlock(chatState) {
  const transcript = Array.isArray(chatState?.recent_transcript)
    ? chatState.recent_transcript.map(normalizeTranscriptEntry).filter(Boolean).slice(-maxRecentTranscriptEntries)
    : [];
  if (transcript.length === 0) {
    return "";
  }

  const lines = [
    "Recent transcript window (oldest to newest):",
    "Use this transcript to infer the current household objective, the active topic, and whether the newest message is a follow-up, correction, rollback, or brand-new request.",
    "Prefer the most recent focused segment after any large time gap.",
    "If the newest message still leaves a meaning-changing gap, ask one minimal clarification question.",
  ];
  let previousTimestamp = null;
  for (const entry of transcript) {
    const currentTimestamp = Date.parse(entry.created_at);
    if (Number.isFinite(previousTimestamp) && Number.isFinite(currentTimestamp)) {
      const gapMs = currentTimestamp - previousTimestamp;
      if (gapMs >= transcriptSessionGapMs) {
        lines.push(`--- ${Math.round(gapMs / 60000)} minutes later ---`);
      }
    }
    lines.push(`[${entry.created_at}] ${entry.role}: ${entry.text}`);
    previousTimestamp = Number.isFinite(currentTimestamp) ? currentTimestamp : previousTimestamp;
  }
  return lines.join("\n");
}

function buildSenderIdentityPromptBlock(senderIdentity) {
  if (!senderIdentity) return "";
  const lines = [
    "Telegram sender identity hints:",
    `- recipient name: ${senderIdentity.name || "[unknown]"}`,
  ];
  if (senderIdentity.primary_person_id) {
    lines.push(`- current sender primary person_id: ${senderIdentity.primary_person_id}`);
    lines.push("- If the user says 提我, 我自己, or another clearly personal self-reminder, prefer this person_id as owner_person_id.");
  }
  if (Array.isArray(senderIdentity.owner_person_ids) && senderIdentity.owner_person_ids.length > 0) {
    lines.push(`- sender owner person_ids: ${senderIdentity.owner_person_ids.join(", ")}`);
  }
  if (Array.isArray(senderIdentity.related_person_ids) && senderIdentity.related_person_ids.length > 0) {
    lines.push(`- sender watched related person_ids: ${senderIdentity.related_person_ids.join(", ")}`);
  }
  lines.push("- When a task is clearly about BB, spouse, or another person, set related_person_id when the target person is clear.");
  lines.push("- Reminder delivery uses owner_person_id and related_person_id for personalization. Shared tasks can still leave both blank.");
  return lines.join("\n");
}

function buildLocalTimePromptBlock(now = new Date()) {
  const timestamp = formatHongKongTimestamp(now);
  const dateOnly = timestamp.slice(0, 10);
  return [
    `Current Hong Kong local datetime: ${timestamp}`,
    `Today in Hong Kong: ${dateOnly}`,
    "Resolve relative time words like 今日, 今晚, 聽日, 聽朝, 聽晚, 後日, 下星期, 下個月 against this Hong Kong datetime, not against older thread context.",
  ].join("\n");
}

function buildRecentChatContextPromptBlock(chatState, userText) {
  const lastAction = normalizeLastSuccessfulAction(chatState?.last_successful_action);
  const entities = Array.isArray(chatState?.last_result_entities)
    ? chatState.last_result_entities.map(normalizeResultEntity).filter(Boolean)
    : [];
  if (!lastAction && entities.length === 0) {
    return "";
  }

  const lines = ["Recent successful chat context:"];
  if (lastAction) {
    lines.push(`Most recent successful action(s): ${lastAction.actions.join(", ")}`);
    if (lastAction.source_user_text) {
      lines.push(`Previous source message: ${lastAction.source_user_text}`);
    }
    lines.push(`Recorded at: ${lastAction.created_at}`);
  }
  if (entities.length > 0) {
    lines.push("Recent result entities:");
    for (const entity of entities.slice(0, 5)) {
      lines.push(`- ${formatResultEntityForPrompt(entity)}`);
    }
  }
  if (looksLikeImmediateCorrection(userText, lastAction, entities)) {
    lines.push("The new message likely corrects the most recent successful write. Prefer updating that recent entity by exact id instead of treating this as unrelated small talk or re-scanning broadly.");
  }
  lines.push("Use the transcript window to decide whether this recent success still matches the active topic, especially after a visible time gap.");
  return lines.join("\n");
}

function looksLikeImmediateCorrection(userText, lastAction, entities) {
  const text = String(userText || "").trim();
  if (!text || !lastAction || entities.length === 0) return false;
  const actionSet = new Set(lastAction.actions.map((entry) => String(entry || "").trim()));
  const recentWrite = ["append_task", "update_task", "append_baby_log", "record_inventory_purchase_batch", "record_inventory_consume_batch", "set_inventory_stock_level", "update_inventory_expiry_date", "upsert_inventory_item", "append_household_memory"]
    .some((action) => actionSet.has(action));
  if (!recentWrite) return false;
  if (/(先啱|先岩|更正|改返|改做|唔係|不是|其實|今日係|應該係|搞錯|記錯)/.test(text)) return true;
  if (entities[0]?.kind === "task" && /(\d{1,2}[:：]\d{2}|[0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{1,2}月[0-9]{1,2}號|聽朝|聽日|明天|明日|後日)/.test(text)) {
    return true;
  }
  return false;
}

function formatResultEntityForPrompt(entity) {
  const parts = [];
  parts.push(entity.kind || "entity");
  if (entity.entity_id) parts.push(`id=${entity.entity_id}`);
  if (entity.name) parts.push(`name=${entity.name}`);
  if (entity.due_at) parts.push(`due_at=${entity.due_at}`);
  if (entity.status) parts.push(`status=${entity.status}`);
  if (entity.category) parts.push(`category=${entity.category}`);
  if (entity.unit) parts.push(`unit=${entity.unit}`);
  if (entity.location) parts.push(`location=${entity.location}`);
  if (entity.memory_type) parts.push(`memory_type=${entity.memory_type}`);
  if (entity.confidence) parts.push(`confidence=${entity.confidence}`);
  if (entity.next_expiry_date) parts.push(`next_expiry_date=${entity.next_expiry_date}`);
  if (entity.quantity_on_hand !== "") parts.push(`quantity_on_hand=${entity.quantity_on_hand}`);
  return parts.join(" ");
}

function applySuccessfulTurnContext(chatState, envelope, sourceUserText) {
  const successfulExecutions = Array.isArray(envelope?.successful_executions)
    ? envelope.successful_executions.filter((entry) => entry?.execution?.ok)
    : [];
  const latestExecution = envelope?.latest_successful_execution?.execution?.ok
    ? envelope.latest_successful_execution
    : null;
  const preferredExecution = pickPreferredSuccessfulExecution(successfulExecutions, latestExecution);
  if (!preferredExecution?.execution?.ok) {
    return;
  }
  const action = String(
    preferredExecution.execution?.parsed_json?.action
    || preferredExecution.command_request?.argv?.[0]
    || "",
  ).trim();
  if (!action) {
    return;
  }
  chatState.last_successful_action = normalizeLastSuccessfulAction({
    actions: [action],
    source_user_text: sourceUserText,
    created_at: new Date().toISOString(),
  });
  const entities = extractResultEntitiesFromExecution(action, preferredExecution.execution?.parsed_json?.result);
  if (entities.length > 0) {
    chatState.last_result_entities = entities;
    chatState.recent_subject = entities[0];
  }
}

function pickPreferredSuccessfulExecution(successfulExecutions, latestExecution) {
  const executions = Array.isArray(successfulExecutions) ? successfulExecutions : [];
  for (let index = executions.length - 1; index >= 0; index -= 1) {
    const candidate = executions[index];
    if (isStateChangingAction(candidate)) {
      return candidate;
    }
  }
  return latestExecution || executions.at(-1) || null;
}

function isStateChangingAction(executionEntry) {
  const action = String(
    executionEntry?.execution?.parsed_json?.action
    || executionEntry?.command_request?.argv?.[0]
    || "",
  ).trim();
  return new Set([
    "append_task",
    "update_task",
    "append_baby_log",
    "record_inventory_purchase_batch",
    "record_inventory_consume_batch",
    "set_inventory_stock_level",
    "update_inventory_expiry_date",
    "upsert_inventory_item",
    "append_household_memory",
  ]).has(action);
}

function extractResultEntitiesFromExecution(action, result) {
  const normalizedAction = String(action || "").trim();
  if (!normalizedAction) return [];
  if (["append_task", "update_task"].includes(normalizedAction)) {
    const entity = buildTaskResultEntity(result);
    return entity ? [entity] : [];
  }
  if (normalizedAction === "append_household_memory") {
    const entity = buildHouseholdMemoryResultEntity(result);
    return entity ? [entity] : [];
  }
  if (normalizedAction === "query_household_memory") {
    return Array.isArray(result) ? result.map(buildHouseholdMemoryResultEntity).filter(Boolean).slice(0, 5) : [];
  }
  if (["query_tasks", "get_upcoming_tasks", "get_overdue_tasks"].includes(normalizedAction)) {
    return Array.isArray(result) ? result.map(buildTaskResultEntity).filter(Boolean).slice(0, 5) : [];
  }
  if (["get_inventory_snapshot", "get_low_stock_items"].includes(normalizedAction)) {
    return Array.isArray(result) ? result.map(buildInventoryResultEntity).filter(Boolean).slice(0, 5) : [];
  }
  if (["set_inventory_stock_level", "update_inventory_expiry_date", "upsert_inventory_item"].includes(normalizedAction)) {
    const entity = buildInventoryResultEntity(result);
    return entity ? [entity] : [];
  }
  if (["record_inventory_purchase_batch", "record_inventory_consume_batch"].includes(normalizedAction)) {
    const items = Array.isArray(result?.items) ? result.items : [];
    return items.map(buildInventoryResultEntity).filter(Boolean).slice(0, 5);
  }
  return [];
}

function buildTaskResultEntity(task) {
  if (!task || typeof task !== "object") return null;
  const entity = normalizeResultEntity({
    kind: "task",
    entity_id: task.task_id,
    name: task.task_name,
    due_at: task.due_at,
    status: task.status,
    category: task.category,
  });
  return entity;
}

function buildInventoryResultEntity(item) {
  if (!item || typeof item !== "object") return null;
  return normalizeResultEntity({
    kind: "inventory_item",
    entity_id: item.item_id || item.item_key,
    name: item.item_name,
    unit: item.unit,
    next_expiry_date: item.next_expiry_date,
    quantity_on_hand: item.quantity_on_hand,
    category: item.category,
  });
}

function buildHouseholdMemoryResultEntity(memory) {
  if (!memory || typeof memory !== "object") return null;
  return normalizeResultEntity({
    kind: "household_memory",
    entity_id: memory.memory_id,
    name: memory.subject,
    location: memory.location,
    status: memory.status,
    category: memory.category,
    memory_type: memory.memory_type,
    confidence: memory.confidence,
  });
}

function buildBridgeStepLimitFallbackEnvelope({
  userText,
  executionHistory,
  successfulExecutions,
  latestSuccessfulExecution,
}) {
  const latestExecutionEntry = Array.isArray(executionHistory) ? executionHistory.at(-1) || null : null;
  const clarifyQuestion = deriveBridgeClarificationQuestionFromExecutionHistory(executionHistory, userText);
  const hasStateChangingSuccess = Array.isArray(successfulExecutions)
    && successfulExecutions.some((entry) => isStateChangingAction(entry));

  if (clarifyQuestion && !hasStateChangingSuccess) {
    return {
      status: "clarify",
      reply_text: clarifyQuestion,
      clarification: {
        question: clarifyQuestion,
        allow_free_text: true,
        choices: [],
      },
      command_request: null,
      latest_successful_execution: latestSuccessfulExecution,
      successful_executions: successfulExecutions,
    };
  }

  const desktopReply = hasStateChangingSuccess
    ? `${persona.firstPersonStyle}今次行到太多步喇。為免重覆改動資料，我先停喺度；你可以叫我查一查最新結果，或者改用 Desktop 再處理複雜調整。`
    : buildDesktopRequiredReplyFromExecution(latestExecutionEntry);

  return {
    status: "desktop_required",
    reply_text: desktopReply,
    clarification: null,
    command_request: null,
    latest_successful_execution: latestSuccessfulExecution,
    successful_executions: successfulExecutions,
  };
}

function deriveBridgeClarificationQuestionFromExecutionHistory(executionHistory, userText) {
  const latestExecutionEntry = Array.isArray(executionHistory) ? executionHistory.at(-1) || null : null;
  const execution = latestExecutionEntry?.execution || null;
  const commandRequest = latestExecutionEntry?.command_request || null;
  const errorText = String(
    execution?.error
    || execution?.stderr
    || execution?.stdout
    || "",
  ).trim();
  const compactErrorText = errorText.replace(/\s+/g, " ").trim();

  if (looksLikeUserFacingClarificationQuestion(compactErrorText)) {
    return compactErrorText;
  }

  const unitMismatch = /Unit mismatch for\s+(.+?):\s+existing=([a-z_]+),\s+requested=([a-z_]+)/i.exec(compactErrorText);
  if (unitMismatch) {
    const itemName = String(unitMismatch[1] || "").trim() || "嗰樣嘢";
    const existingUnit = formatInventoryUnitForUser(unitMismatch[2]);
    const requestedUnit = formatInventoryUnitForUser(unitMismatch[3]);
    return `${itemName} 想當 ${requestedUnit} 定 ${existingUnit} 呀？`;
  }

  const action = String(commandRequest?.argv?.[0] || "").trim();
  if (action === "inventory_unit_preflight") {
    return `${persona.firstPersonStyle}仲差少少資料先可以安全記錄，你想用邊個 item 名稱或者單位呀？`;
  }
  if (["query_tasks", "update_task", "append_task"].includes(action)) {
    return `${persona.firstPersonStyle}想先確認清楚係邊一個 task。你可以講多一句任務名稱、日期、時間，或者地點嗎？`;
  }
  if (["query_household_memory", "append_household_memory"].includes(action)) {
    return `${persona.firstPersonStyle}想幫你處理屋企備忘，但而家仲未夠清楚係邊樣物件或者放喺邊度。你再講多次個 subject 或 location，${persona.firstPersonStyle}就可以再試。`;
  }
  if (["record_inventory_consume_batch", "record_inventory_purchase_batch", "set_inventory_stock_level", "update_inventory_expiry_date", "upsert_inventory_item"].includes(action)) {
    return `${persona.firstPersonStyle}想先確認清楚係邊樣存貨，同埋用咩單位去記。你可以講多一句 item 名稱或者單位嗎？`;
  }
  if (String(userText || "").trim()) {
    return `${persona.firstPersonStyle}仲差少少資料先可以安全寫入。你可以用自然語言講多一句，講清楚想改邊樣、數量或者時間嗎？`;
  }
  return "";
}

function looksLikeUserFacingClarificationQuestion(text) {
  const value = String(text || "").trim();
  if (!value) return false;
  if (value.length > 240) return false;
  if (/[?？]$/.test(value)) return true;
  return /(你想|你係咪|可以講返|可以講多一句|呢個係新物品|如果唔係)/.test(value);
}

function buildDesktopRequiredReplyFromExecution(executionEntry) {
  const errorText = String(
    executionEntry?.execution?.error
    || executionEntry?.execution?.stderr
    || executionEntry?.execution?.stdout
    || "",
  ).trim();
  if (/timed out|timeout/i.test(errorText)) {
    return `${persona.firstPersonStyle}今次等得太耐都未安全完成，呢類情況改用 Desktop 會穩陣啲。`;
  }
  return `${persona.firstPersonStyle}今次行到太多步都未安全收口，呢個情況我建議改用 Desktop 再處理。`;
}

function formatInventoryUnitForUser(unit) {
  const normalized = String(unit || "").trim().toLowerCase();
  const labels = {
    pack: "包",
    packs: "包",
    piece: "個",
    pieces: "個",
    bottle: "支",
    bottles: "支",
    box: "盒",
    boxes: "盒",
    roll: "卷",
    rolls: "卷",
    cup: "杯",
    cups: "杯",
    can: "罐",
    cans: "罐",
    percent: "%",
  };
  return labels[normalized] || String(unit || "").trim() || "原本單位";
}

function findLatestInventoryWriteExecution(envelope) {
  const successfulExecutions = Array.isArray(envelope?.successful_executions)
    ? envelope.successful_executions.filter((entry) => entry?.execution?.ok)
    : [];
  for (let index = successfulExecutions.length - 1; index >= 0; index -= 1) {
    const entry = successfulExecutions[index];
    const action = String(
      entry?.execution?.parsed_json?.action
      || entry?.command_request?.argv?.[0]
      || "",
    ).trim();
    if (["record_inventory_consume_batch", "record_inventory_purchase_batch", "set_inventory_stock_level", "update_inventory_expiry_date", "upsert_inventory_item"].includes(action)) {
      return entry;
    }
  }
  return null;
}

function appendInventoryRemainingSummaryIfMissing(replyText, executionEntry) {
  const text = String(replyText || "").trim();
  if (!text || /仲有|剩返|而家有/.test(text)) {
    return text;
  }
  const action = String(
    executionEntry?.execution?.parsed_json?.action
    || executionEntry?.command_request?.argv?.[0]
    || "",
  ).trim();
  if (!["record_inventory_consume_batch", "record_inventory_purchase_batch", "set_inventory_stock_level", "update_inventory_expiry_date", "upsert_inventory_item"].includes(action)) {
    return text;
  }

  const result = executionEntry?.execution?.parsed_json?.result;
  const items = Array.isArray(result?.items)
    ? result.items
    : result && typeof result === "object"
    ? [result]
    : [];
  const withStock = items
    .map((item) => ({
      item_name: String(item?.item_name || "").trim(),
      quantity_on_hand: item?.quantity_on_hand,
      unit: String(item?.unit || "").trim(),
    }))
    .filter((item) => item.item_name && item.quantity_on_hand !== undefined && item.quantity_on_hand !== null && item.quantity_on_hand !== "");

  if (withStock.length === 0) {
    return text;
  }

  const suffix = withStock
    .slice(0, 3)
    .map((item) => `而家仲有 ${formatInventoryQuantityForUser(item.quantity_on_hand)} ${formatInventoryUnitForUser(item.unit)}${item.item_name}`)
    .join("；");
  if (!suffix) {
    return text;
  }
  return text.endsWith("。") ? `${text}${suffix}。` : `${text}。${suffix}。`;
}

function formatInventoryQuantityForUser(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Number.isInteger(value) ? String(value) : String(value).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
  }
  const text = String(value || "").trim();
  if (!text) return "";
  return text.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

function formatHongKongTimestamp(now = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(formatter.formatToParts(now).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}+08:00`;
}

function shouldRetryWithFreshThread(error) {
  const message = String(error?.message || error || "");
  return /thread|session|resume|abort|timeout/i.test(message);
}

function stripJsonFences(text) {
  return String(text || "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

function readJsonFile(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function readReminderRecipientMap(filePath) {
  const parsed = readJsonFile(filePath, {});
  const recipients = Array.isArray(parsed?.recipients) ? parsed.recipients : [];
  return Object.fromEntries(
    recipients
      .map((recipient) => normalizeReminderRecipientIdentity(recipient))
      .filter((recipient) => recipient.telegram_user_id)
      .map((recipient) => [recipient.telegram_user_id, recipient]),
  );
}

function normalizeReminderRecipientIdentity(recipient) {
  const personScope = recipient?.person_scope && typeof recipient.person_scope === "object"
    ? recipient.person_scope
    : {};
  return {
    name: String(recipient?.name || recipient?.telegram_user_id || recipient?.chat_id || "recipient"),
    telegram_user_id: String(recipient?.telegram_user_id || ""),
    primary_person_id: firstNonEmptyString(personScope.primary_person_id),
    owner_person_ids: normalizeStringList(personScope.owner_person_ids),
    related_person_ids: normalizeStringList(personScope.related_person_ids),
  };
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

function readRuntimeConfig(filePath) {
  const parsed = readJsonFile(filePath, defaultRuntimeConfig);
  const skillNames = Array.isArray(parsed?.skill_names) && parsed.skill_names.length > 0
    ? parsed.skill_names.map((entry) => String(entry || "").trim()).filter(Boolean)
    : defaultRuntimeConfig.skill_names;
  const bridgeCommandsSource = parsed?.bridge_commands && typeof parsed.bridge_commands === "object"
    ? parsed.bridge_commands
    : defaultRuntimeConfig.bridge_commands;
  const bridgeCommands = Object.fromEntries(Object.entries(bridgeCommandsSource).map(([commandId, commandDef]) => [
    commandId,
    {
      runner: String(commandDef?.runner || "").trim() || defaultRuntimeConfig.bridge_commands[commandId]?.runner || "node",
      path: String(commandDef?.path || "").trim() || defaultRuntimeConfig.bridge_commands[commandId]?.path || "",
      node_args: Array.isArray(commandDef?.node_args)
        ? commandDef.node_args.map((entry) => String(entry || "").trim()).filter(Boolean)
        : Array.isArray(defaultRuntimeConfig.bridge_commands[commandId]?.node_args)
        ? defaultRuntimeConfig.bridge_commands[commandId].node_args
        : [],
    },
  ]));
  const references = parsed?.references && typeof parsed.references === "object"
    ? {
      bb_log_templates: String(parsed.references.bb_log_templates || "").trim() || defaultRuntimeConfig.references.bb_log_templates,
      inventory_flows: String(parsed.references.inventory_flows || "").trim() || defaultRuntimeConfig.references.inventory_flows,
      task_management: String(parsed.references.task_management || "").trim() || defaultRuntimeConfig.references.task_management,
      household_memory: String(parsed.references.household_memory || "").trim() || defaultRuntimeConfig.references.household_memory,
      unit_normalization: String(parsed.references.unit_normalization || "").trim() || defaultRuntimeConfig.references.unit_normalization,
      ambiguity_policy: String(parsed.references.ambiguity_policy || "").trim() || defaultRuntimeConfig.references.ambiguity_policy,
      self_enhance_policy: String(parsed.references.self_enhance_policy || "").trim() || defaultRuntimeConfig.references.self_enhance_policy,
    }
    : defaultRuntimeConfig.references;

  return {
    plugin_name: String(parsed?.plugin_name || "").trim() || defaultRuntimeConfig.plugin_name,
    primary_skill_root: String(parsed?.primary_skill_root || "").trim() || defaultRuntimeConfig.primary_skill_root,
    api_skill_root: String(parsed?.api_skill_root || "").trim() || defaultRuntimeConfig.api_skill_root,
    skill_names: skillNames,
    runtime_knowledge_root: String(parsed?.runtime_knowledge_root || "").trim() || defaultRuntimeConfig.runtime_knowledge_root,
    relative_config_path: String(parsed?.relative_config_path || "").trim() || defaultRuntimeConfig.relative_config_path,
    bridge_commands: bridgeCommands,
    references,
  };
}

function normalizeCommandRequest(value) {
  const source = value && typeof value === "object" ? value : {};
  return {
    command_id: String(source.command_id || "").trim(),
    argv: Array.isArray(source.argv)
      ? source.argv.map((entry) => String(entry || ""))
      : [],
  };
}

function runNodeRuntimeCommand(workspace, scriptPath, argv, timeoutMs, nodeArgs = []) {
  return runBridgeProcess("node", [...nodeArgs, scriptPath, ...argv], workspace, timeoutMs);
}

function runCmdRuntimeCommand(workspace, scriptPath, argv, timeoutMs) {
  const commandLine = [quoteWindowsArg(scriptPath), ...argv.map(quoteWindowsArg)].join(" ");
  return runBridgeProcess("cmd.exe", ["/d", "/s", "/c", commandLine], workspace, timeoutMs);
}

function runBridgeProcess(command, args, workspace, timeoutMs) {
  try {
    const result = spawnSync(command, args, {
      cwd: workspace,
      encoding: "utf8",
      timeout: Math.max(10000, Math.min(timeoutMs, 120000)),
      windowsHide: true,
    });
    const stdout = redact(String(result.stdout || "").trim());
    const stderr = redact(String(result.stderr || "").trim());
    const parsedJson = parseJsonMaybe(stdout);
    return {
      ok: result.status === 0 && !result.error,
      exit_code: Number.isInteger(result.status) ? result.status : -1,
      stdout,
      stderr,
      parsed_json: parsedJson,
      error: result.error ? String(result.error.message || result.error) : "",
    };
  } catch (error) {
    return {
      ok: false,
      exit_code: -1,
      stdout: "",
      stderr: "",
      parsed_json: null,
      error: String(error?.message || error),
    };
  }
}

function quoteWindowsArg(value) {
  const text = String(value || "");
  if (text.length === 0) return "\"\"";
  if (!/[\s"]/u.test(text)) return text;
  return `"${text.replace(/(\\*)"/g, "$1$1\\\"")}"`;
}

function parseJsonMaybe(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function safeReadTextFile(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  } catch (error) {
    return `[unavailable: ${String(error?.message || error)}]`;
  }
}

function redact(text) {
  return String(text)
    .replace(/(FAMILY_OS_API_KEY=)[^\s]+/gi, "$1[redacted]")
    .replace(/(TELEGRAM_BOT_TOKEN=)[^\s]+/gi, "$1[redacted]")
    .replace(/([?&]key=)[^&\s]+/gi, "$1[redacted]");
}

function appendBridgeErrorLog(error, context = {}) {
  try {
    ensureParentDirectory(bridgeErrorLogPath);
    const entry = {
      timestamp: new Date().toISOString(),
      message: redact(String(error?.message || error || "")),
      name: String(error?.name || ""),
      stack: redact(String(error?.stack || "").split("\n").slice(0, 8).join("\n")),
      context: {
        chat_id: String(context.chat_id || ""),
        telegram_user_id: String(context.telegram_user_id || ""),
        user_text: String(context.user_text || "").slice(0, 2000),
      },
    };
    fs.appendFileSync(bridgeErrorLogPath, `${JSON.stringify(entry)}\n`, "utf8");
  } catch {
    // Logging must never make a Telegram turn fail.
  }
}

function readCodexLoginStatus() {
  const localCodexHome = process.env.CODEX_HOME
    ? path.resolve(process.env.CODEX_HOME)
    : path.join(os.homedir(), ".codex");
  for (const codexCommand of [bundledCodexPath, "codex"]) {
    try {
      const output = execFileSync(codexCommand, ["login", "status"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          CODEX_HOME: localCodexHome,
        },
      }).trim();

      if (/not logged in/i.test(output)) {
        return { ok: false, message: output || "Not logged in" };
      }
      return { ok: true, message: output || "Logged in" };
    } catch (error) {
      if (error?.code === "ENOENT") {
        continue;
      }
      const output = `${error.stdout || ""}${error.stderr || ""}`.trim();
      if (/not logged in/i.test(output) || /not logged in/i.test(String(error.message || ""))) {
        return { ok: false, message: output || "Not logged in" };
      }
      if (output || error.message) {
        return { ok: false, message: output || String(error.message) };
      }
    }
  }
  return { ok: false, message: "Codex login status could not be determined." };
}

const isMainModule = path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url);

if (isMainModule && process.argv.includes("--self-test")) {
  const bridge = new CodexBridge();
  const health = bridge.health({ requireLogin: false });
  const options = bridge.threadOptions();

  if (!health.checks.runtime_config) {
    throw new Error("Bridge health failed: runtime config is missing.");
  }
  if (!health.checks.runtime_knowledge_root) {
    throw new Error("Bridge health failed: runtime knowledge root is missing.");
  }
  if (!Object.values(health.checks.command_targets).every(Boolean)) {
    throw new Error("Bridge health failed: one or more runtime command targets are missing.");
  }
  if (!Object.values(health.checks.references).every(Boolean)) {
    throw new Error("Bridge health failed: one or more runtime reference files are missing.");
  }
  if (options.model !== "gpt-5.4" || options.modelReasoningEffort !== "medium") {
    throw new Error("Bridge self-test failed: thread model options are invalid.");
  }
  if (options.networkAccessEnabled !== true || options.approvalPolicy !== "never") {
    throw new Error("Bridge self-test failed: thread execution policy is invalid.");
  }

  const schema = bridgeEnvelopeSchema(bridge.runtimeConfig);
  if (schema.properties.status.enum.length !== 4) {
    throw new Error("Bridge self-test failed: output schema is invalid.");
  }

  const parsedEnvelope = parseBridgeEnvelope(JSON.stringify({
    status: "execute",
    reply_text: "",
    clarification: null,
    command_request: {
      command_id: "runtime_learning",
      argv: ["--self-test"],
    },
  }));
  if (parsedEnvelope.status !== "execute" || parsedEnvelope.command_request?.command_id !== "runtime_learning") {
    throw new Error("Bridge self-test failed: execute envelope parsing is invalid.");
  }

  const execution = bridge.executeBridgeCommand({
    command_id: "runtime_learning",
    argv: ["--self-test"],
  });
  if (!execution.ok || execution.exit_code !== 0 || !/self-test passed/i.test(execution.stdout)) {
    throw new Error("Bridge self-test failed: runtime learning helper execution is invalid.");
  }

  const preflightExecution = bridge.executeBridgeCommand({
    command_id: "inventory_unit_preflight",
    argv: ["--self-test"],
  });
  if (!preflightExecution.ok || preflightExecution.exit_code !== 0 || !/self-test passed/i.test(preflightExecution.stdout)) {
    throw new Error("Bridge self-test failed: inventory unit preflight helper execution is invalid.");
  }

  const originalStructuredTurn = bridge.runStructuredTurnWithTimeout;
  const originalExecuteBridgeCommand = bridge.executeBridgeCommand;
  let loopStep = 0;
  bridge.runStructuredTurnWithTimeout = async () => {
    if (loopStep === 0) {
      loopStep += 1;
      return {
        finalResponse: JSON.stringify({
          status: "execute",
          reply_text: "",
          clarification: null,
          command_request: {
            command_id: "runtime_learning",
            argv: ["--self-test"],
          },
        }),
      };
    }
    return {
      finalResponse: JSON.stringify({
        status: "clarify",
        reply_text: "How many ml?",
        clarification: {
          question: "How many ml?",
          allow_free_text: true,
          choices: [{ label: "90 ml", resume_text: "BB feeding amount is 90 ml." }],
        },
        command_request: null,
      }),
    };
  };
  bridge.executeBridgeCommand = () => ({
    ok: true,
    command_id: "runtime_learning",
    exit_code: 0,
    stdout: "manage_runtime_learning self-test passed.",
    stderr: "",
    parsed_json: null,
    error: "",
  });
  const loopEnvelope = await bridge.runBridgeTurnLoop({ id: "thread_test" }, "BB 飲奶", "42");
  bridge.runStructuredTurnWithTimeout = originalStructuredTurn;
  bridge.executeBridgeCommand = originalExecuteBridgeCommand;
  if (loopEnvelope.status !== "clarify" || loopEnvelope.clarification?.choices?.[0]?.label !== "90 ml") {
    throw new Error("Bridge self-test failed: broker loop orchestration is invalid.");
  }

  const originalStructuredTurnForFallback = bridge.runStructuredTurnWithTimeout;
  const originalExecuteBridgeCommandForFallback = bridge.executeBridgeCommand;
  bridge.runStructuredTurnWithTimeout = async () => ({
    finalResponse: JSON.stringify({
      status: "execute",
      reply_text: "",
      clarification: null,
      command_request: {
        command_id: "bb_inventory_api",
        argv: ["record_inventory_consume_batch"],
      },
    }),
  });
  bridge.executeBridgeCommand = () => ({
    ok: false,
    command_id: "bb_inventory_api",
    exit_code: 1,
    stdout: "",
    stderr: "",
    parsed_json: null,
    error: "Unit mismatch for 公仔麵: existing=pack, requested=piece",
  });
  const stepLimitClarifyEnvelope = await bridge.runBridgeTurnLoop({ id: "thread_test_fallback_1" }, "食咗個公仔麵", "42");
  bridge.runStructuredTurnWithTimeout = originalStructuredTurnForFallback;
  bridge.executeBridgeCommand = originalExecuteBridgeCommandForFallback;
  if (
    stepLimitClarifyEnvelope.status !== "clarify"
    || stepLimitClarifyEnvelope.clarification?.question !== "公仔麵 想當 個 定 包 呀？"
  ) {
    throw new Error("Bridge self-test failed: step-limit clarify fallback is invalid.");
  }

  const originalStructuredTurnForDesktopFallback = bridge.runStructuredTurnWithTimeout;
  const originalExecuteBridgeCommandForDesktopFallback = bridge.executeBridgeCommand;
  let desktopFallbackStep = 0;
  bridge.runStructuredTurnWithTimeout = async () => ({
    finalResponse: JSON.stringify({
      status: "execute",
      reply_text: "",
      clarification: null,
      command_request: {
        command_id: "bb_inventory_api",
        argv: [desktopFallbackStep === 0 ? "append_task" : "query_tasks"],
      },
    }),
  });
  bridge.executeBridgeCommand = ({ argv }) => {
    desktopFallbackStep += 1;
    return {
      ok: true,
      command_id: "bb_inventory_api",
      exit_code: 0,
      stdout: "",
      stderr: "",
      parsed_json: {
        action: argv?.[0] || "",
        result: argv?.[0] === "append_task"
          ? {
            task_id: "tsk_smoke",
            task_name: "產檢",
            due_at: "2026-06-09 11:30:00+08:00",
            status: "open",
            category: "medical",
          }
          : [{ task_id: "tsk_smoke", task_name: "產檢" }],
      },
      error: "",
    };
  };
  const stepLimitDesktopEnvelope = await bridge.runBridgeTurnLoop({ id: "thread_test_fallback_2" }, "幫我記低產檢", "42");
  bridge.runStructuredTurnWithTimeout = originalStructuredTurnForDesktopFallback;
  bridge.executeBridgeCommand = originalExecuteBridgeCommandForDesktopFallback;
  if (stepLimitDesktopEnvelope.status !== "desktop_required") {
    throw new Error("Bridge self-test failed: step-limit desktop fallback is invalid.");
  }

  const clarifyState = normalizeChatState({ thread_id: "thread_clarify" });
  const clarifyReply = bridge.buildBridgeReply(clarifyState, {
    status: "clarify",
    reply_text: "係邊樣嘢要加返 1 包？",
    clarification: {
      question: "係邊樣嘢要加返 1 包？",
      allow_free_text: true,
      choices: [{ label: "公仔麵", resume_text: "幫我加返一包公仔麵" }],
    },
    command_request: null,
  }, {
    sourceUserText: "記錯咗 冇食到 幫我加返一包",
  });
  const resumeContext = getPendingClarificationContext(clarifyState);
  const resumedPrompt = bridge.buildFamilyOsAgentPrompt("公仔麵", "42", clarifyState, resumeContext);
  if (
    clarifyReply.text !== "係邊樣嘢要加返 1 包？"
    || !resumeContext
    || resumeContext.original_user_text !== "記錯咗 冇食到 幫我加返一包"
    || !/Pending clarification question: 係邊樣嘢要加返 1 包？/.test(resumedPrompt)
    || !/Original Telegram user message: 記錯咗 冇食到 幫我加返一包/.test(resumedPrompt)
  ) {
    throw new Error("Bridge self-test failed: free-text clarification resume context is invalid.");
  }

  const chatState = normalizeChatState({
    thread_id: "thread_123",
    pending_choices: [
      {
        token: "cb_1",
        label: "90 ml",
        resume_text: "BB feeding amount is 90 ml.",
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 60000).toISOString(),
      },
    ],
    pending_clarification: {
      question: "How many ml?",
      allow_free_text: true,
      original_user_text: "BB 飲奶",
      last_reply_text: "How many ml?",
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 60000).toISOString(),
    },
    last_successful_action: {
      actions: ["append_task"],
      source_user_text: "幫我記低聽朝11:30要去產檢",
      created_at: new Date().toISOString(),
    },
    last_result_entities: [
      {
        kind: "task",
        entity_id: "tsk_1",
        name: "去產檢",
        due_at: "2026-06-09 11:30:00+08:00",
        status: "open",
        category: "medical",
      },
    ],
    recent_transcript: [
      {
        role: "user",
        text: "幫我記低聽朝11:30要去產檢",
        created_at: "2026-06-08T04:19:33.000Z",
      },
      {
        role: "assistant",
        text: "好呀，已幫你記低：去產檢，時間係 2026-06-09 11:30。",
        created_at: "2026-06-08T04:19:40.000Z",
      },
      {
        role: "user",
        text: "有咩未做",
        created_at: "2026-06-08T04:45:17.000Z",
      },
      {
        role: "assistant",
        text: "而家有幾項未完成 task。",
        created_at: "2026-06-08T04:45:23.000Z",
      },
    ],
  });
  pruneChatState(chatState);
  if (
    !chatState.thread_id
    || chatState.pending_choices.length !== 1
    || chatState.pending_clarification?.question !== "How many ml?"
    || chatState.last_successful_action?.actions?.[0] !== "append_task"
    || chatState.last_result_entities?.[0]?.entity_id !== "tsk_1"
    || chatState.recent_transcript?.length !== 4
  ) {
    throw new Error("Bridge self-test failed: state normalization is invalid.");
  }

  const correctionPrompt = bridge.buildFamilyOsAgentPrompt("係6月9號先啱 今日係6月8號", "7476829331", chatState, null);
  if (
    !/Current Hong Kong local datetime: /.test(correctionPrompt)
    || !/current sender primary person_id: per_husband/.test(correctionPrompt)
    || !/Recent transcript window \(oldest to newest\):/.test(correctionPrompt)
    || !/--- 26 minutes later ---/.test(correctionPrompt)
    || !/Most recent successful action\(s\): append_task/.test(correctionPrompt)
    || !/The new message likely corrects the most recent successful write\./.test(correctionPrompt)
  ) {
    throw new Error("Bridge self-test failed: recent task correction context is invalid.");
  }

  const recapState = normalizeChatState({ thread_id: "thread_recap" });
  applySuccessfulTurnContext(recapState, {
    latest_successful_execution: {
      command_request: { argv: ["query_tasks"] },
      execution: { ok: true, parsed_json: { action: "query_tasks", result: [{ task_id: "tsk_query", task_name: "Recap only" }] } },
    },
    successful_executions: [
      {
        command_request: { argv: ["append_task"] },
        execution: {
          ok: true,
          parsed_json: {
            action: "append_task",
            result: {
              task_id: "tsk_recent",
              task_name: "Recent exact task",
              due_at: "2026-06-09 11:30:00+08:00",
              status: "open",
              category: "medical",
            },
          },
        },
      },
      {
        command_request: { argv: ["query_tasks"] },
        execution: { ok: true, parsed_json: { action: "query_tasks", result: [{ task_id: "tsk_query", task_name: "Recap only" }] } },
      },
    ],
  }, "remember the exact task");
  if (
    recapState.last_successful_action?.actions?.[0] !== "append_task"
    || recapState.last_result_entities?.[0]?.entity_id !== "tsk_recent"
  ) {
    throw new Error("Bridge self-test failed: recap query should not replace the recent write target.");
  }

  const invalidCommand = validateBridgeTurnItem({
    type: "command_execution",
    command: "node scripts/anything-else.mjs",
    aggregated_output: "",
    status: "completed",
    id: "cmd_2",
    exit_code: 0,
  }, {
    runtimeKnowledgeRoot: bridge.runtimeKnowledgeRoot,
    workspace: bridge.workspace,
  });
  if (invalidCommand.ok) {
    throw new Error("Bridge self-test failed: direct thread command usage was not rejected.");
  }

  const validChange = validateBridgeTurnItem({
    type: "file_change",
    changes: [{ path: "plugins-staging/family-os-bb-inventory/runtime/learned-knowledge.json", kind: "update" }],
    status: "completed",
    id: "patch_2",
  }, {
    runtimeKnowledgeRoot: bridge.runtimeKnowledgeRoot,
    workspace: bridge.workspace,
  });
  if (!validChange.ok) {
    throw new Error("Bridge self-test failed: runtime knowledge file changes should be allowed.");
  }

  const noMcp = validateBridgeTurnItem({
    type: "mcp_tool_call",
    server: "test",
    tool: "foo",
    arguments: {},
    status: "completed",
    id: "mcp_1",
  }, {
    runtimeKnowledgeRoot: bridge.runtimeKnowledgeRoot,
    workspace: bridge.workspace,
  });
  if (noMcp.ok) {
    throw new Error("Bridge self-test failed: MCP usage was not rejected.");
  }

  console.log("Family OS Codex Bridge self-test passed.");
}
