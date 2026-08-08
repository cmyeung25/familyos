import fs from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { ensureParentDirectory, ensureRuntimeDirectories, resolveFamilyOsPaths } from "./instance_paths.mjs";
import { buildLlmRunOptions, createLlmProvider } from "./llm_provider.mjs";
import { loadFamilyOsPersona } from "./persona_config.mjs";
import { normalizeInventoryUnitAlias, resolveInventoryMatch } from "./family_os_api_client.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const runtimePaths = resolveFamilyOsPaths();
ensureRuntimeDirectories(runtimePaths);
const persona = loadFamilyOsPersona();
const defaultWorkspace = runtimePaths.workspaceRoot;
const defaultStatePath = runtimePaths.bridgeStatePath;
const bridgeErrorLogPath = runtimePaths.bridgeErrorLogPath;
const defaultRuntimeConfigPath = runtimePaths.runtimeConfigPath;
const defaultReminderConfigPath = runtimePaths.reminderConfigPath;
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
    this.llmProvider = createLlmProvider({ workspace: this.workspace });
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
    const providerHealth = this.llmProvider.health({ requireLogin });
    const checks = {
      llm_provider: providerHealth.provider,
      llm_auth: providerHealth.message,
      ...providerHealth.checks,
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
    const ok = providerHealth.ok
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
      provider: providerHealth.provider,
      auth_mode: providerHealth.authMode,
      model: this.threadOptions().model,
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
      throw new Error(this.llmProvider.notReadyMessage());
    }
    const stateKey = String(chatId);
    const chatState = this.getChatState(stateKey, true);
    const normalizedUserText = String(userText || "").trim();
    const resumeContext = getPendingClarificationContext(chatState);
    const stitchedUserText = shouldStitchPendingClarificationAnswer(normalizedUserText, resumeContext)
      ? buildClarificationResumeInput({
        pendingClarification: resumeContext,
        answerText: normalizedUserText,
      })
      : normalizedUserText;
    return this.runChatTurn(stateKey, stitchedUserText, telegramUserId, {
      clearPending: false,
      resumeContext,
      transcriptUserText: stitchedUserText === normalizedUserText ? null : normalizedUserText,
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

    const pendingClarification = chatState.pending_clarification;
    chatState.pending_choices = [];
    chatState.pending_clarification = null;
    chatState.updated_at = new Date().toISOString();
    this.saveState();

    const result = await this.runChatTurn(
      stateKey,
      buildClarificationResumeInput({
        pendingClarification,
        answerText: choice.label,
        suggestedResumeText: choice.resume_text,
      }),
      telegramUserId,
      {
      clearPending: false,
      transcriptUserText: `[button] ${choice.label}`,
      },
    );
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

    const deterministicBbCalendarEnvelope = this.tryDirectBbCalendarAppointmentTurn(userText, telegramUserId);
    if (deterministicBbCalendarEnvelope) {
      applySuccessfulTurnContext(chatState, deterministicBbCalendarEnvelope, userText);
      const reply = this.buildBridgeReply(chatState, deterministicBbCalendarEnvelope, { sourceUserText: userText });
      appendRecentTranscript(chatState, "user", transcriptUserText || userText);
      appendRecentTranscript(chatState, "assistant", reply.text);
      chatState.updated_at = new Date().toISOString();
      this.saveState();
      return reply;
    }

    const deterministicMemoryEnvelope = this.tryDirectHouseholdMemoryTurn(userText);
    if (deterministicMemoryEnvelope) {
      applySuccessfulTurnContext(chatState, deterministicMemoryEnvelope, userText);
      const reply = this.buildBridgeReply(chatState, deterministicMemoryEnvelope, { sourceUserText: userText });
      appendRecentTranscript(chatState, "user", transcriptUserText || userText);
      appendRecentTranscript(chatState, "assistant", reply.text);
      chatState.updated_at = new Date().toISOString();
      this.saveState();
      return reply;
    }

    const deterministicSafetyStockEnvelope = this.tryDirectInventorySafetyStockTurn(userText);
    if (deterministicSafetyStockEnvelope) {
      applySuccessfulTurnContext(chatState, deterministicSafetyStockEnvelope, userText);
      const reply = this.buildBridgeReply(chatState, deterministicSafetyStockEnvelope, { sourceUserText: userText });
      appendRecentTranscript(chatState, "user", transcriptUserText || userText);
      appendRecentTranscript(chatState, "assistant", reply.text);
      chatState.updated_at = new Date().toISOString();
      this.saveState();
      return reply;
    }

    const deterministicConsumeEnvelope = this.tryDirectExplicitInventoryConsumeTurn(userText);
    if (deterministicConsumeEnvelope) {
      applySuccessfulTurnContext(chatState, deterministicConsumeEnvelope, userText);
      const reply = this.buildBridgeReply(chatState, deterministicConsumeEnvelope, { sourceUserText: userText });
      appendRecentTranscript(chatState, "user", transcriptUserText || userText);
      appendRecentTranscript(chatState, "assistant", reply.text);
      chatState.updated_at = new Date().toISOString();
      this.saveState();
      return reply;
    }

    const deterministicRestockBatchEnvelope = this.tryDirectExplicitInventoryRestockBatchTurn(userText);
    if (deterministicRestockBatchEnvelope) {
      applySuccessfulTurnContext(chatState, deterministicRestockBatchEnvelope, userText);
      const reply = this.buildBridgeReply(chatState, deterministicRestockBatchEnvelope, { sourceUserText: userText });
      appendRecentTranscript(chatState, "user", transcriptUserText || userText);
      appendRecentTranscript(chatState, "assistant", reply.text);
      chatState.updated_at = new Date().toISOString();
      this.saveState();
      return reply;
    }

    const deterministicShoppingDoneEnvelope = this.tryDirectExplicitShoppingTaskDoneTurn(userText, chatState);
    if (deterministicShoppingDoneEnvelope) {
      applySuccessfulTurnContext(chatState, deterministicShoppingDoneEnvelope, userText);
      const reply = this.buildBridgeReply(chatState, deterministicShoppingDoneEnvelope, { sourceUserText: userText });
      appendRecentTranscript(chatState, "user", transcriptUserText || userText);
      appendRecentTranscript(chatState, "assistant", reply.text);
      chatState.updated_at = new Date().toISOString();
      this.saveState();
      return reply;
    }

    const session = this.llmProvider.openSession({
      sessionId: chatState.thread_id,
    });

    try {
      const envelope = await this.runBridgeTurnLoop(session, userText, telegramUserId, chatState, resumeContext);
      if (this.llmProvider.usesPersistentSessions()) {
        chatState.thread_id = this.llmProvider.getSessionId(session);
      } else {
        chatState.thread_id = "";
      }
      applySuccessfulTurnContext(chatState, envelope, userText);
      const reply = this.buildBridgeReply(chatState, envelope, { sourceUserText: userText });
      appendRecentTranscript(chatState, "user", transcriptUserText || userText);
      appendRecentTranscript(chatState, "assistant", reply.text);
      chatState.updated_at = new Date().toISOString();
      this.saveState();
      return reply;
    } catch (error) {
      if (
        !retrying
        && this.llmProvider.usesPersistentSessions()
        && chatState.thread_id
        && shouldRetryWithFreshThread(error)
      ) {
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

  async runBridgeTurnLoop(session, userText, telegramUserId, chatState, resumeContext = null) {
    let prompt = this.buildFamilyOsAgentPrompt(userText, telegramUserId, chatState, resumeContext);
    let latestSuccessfulExecution = null;
    const successfulExecutions = [];
    const executionHistory = [];

    for (let step = 0; step < maxBridgeExecutionSteps; step += 1) {
      const response = await this.runStructuredTurnWithTimeout(
        session,
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

  async runStructuredTurnWithTimeout(session, prompt, outputSchema) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      return await this.llmProvider.runStructuredTurn(session, prompt, {
        signal: controller.signal,
        outputSchema,
        validateItem: (item) => validateBridgeTurnItem(item, {
          runtimeKnowledgeRoot: this.runtimeKnowledgeRoot,
          workspace: this.workspace,
        }),
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  threadOptions() {
    return buildLlmRunOptions(this.workspace);
  }

  buildFamilyOsAgentPrompt(userText, telegramUserId, chatState, resumeContext = null) {
    const promptContext = this.readRuntimePromptContext();
    const bridgeCommands = Object.values(this.bridgeCommands)
      .map((commandDef) => `- ${commandDef.command_id}: runner=${commandDef.runner}, path=${commandDef.path}`)
      .join("\n");
    const localTimeBlock = buildLocalTimePromptBlock();
    const senderIdentity = this.reminderRecipientMap[String(telegramUserId || "")] || null;
    const senderIdentityBlock = buildSenderIdentityPromptBlock(senderIdentity);
    const recentChatContextBlock = buildRecentChatContextPromptBlock(chatState, userText);
    const transcriptContextBlock = buildTranscriptContextPromptBlock(chatState);
    const pendingClarificationBlock = buildPendingClarificationPromptBlock(resumeContext);
    const dobbyIntelligenceBlock = buildDobbyIntelligencePromptBlock({
      userText,
      chatState,
      resumeContext,
      senderIdentity,
    });

    return [
      "This message comes from the allowlisted private Family OS Telegram bridge.",
      "The bridge is transport plus generic runtime-command brokerage only. It does not contain domain rules.",
      "Load and follow AGENTS.md, the active runtime config, and the synced BB + inventory + task + household memory skills.",
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
      `Persona name: ${this.persona.name}.`,
      `Use Cantonese and a humble household-helper tone in reply_text only. When speaking in first person, use "${this.persona.firstPersonStyle}".`,
      "Keep the voice warm, lively, and clearly in-character, but never sacrifice correctness or clarity.",
      "Prefer natural in-character phrasing such as helping, noticing, remembering, or reminding, instead of flat factual narration.",
      "Do not answer a normal successful household query with only one bare factual sentence unless the user explicitly asked for ultra-brief output.",
      `In a normal successful reply, include "${this.persona.firstPersonStyle}" at least once unless the user explicitly asked for no persona wording.`,
      `For routine successful replies, prefer phrasing patterns like "${this.persona.firstPersonStyle}幫你睇到，..." or "${this.persona.firstPersonStyle}已經幫你記低咗..." when they fit the action.`,
      "When it feels natural, add a gentle Cantonese ending particle such as 呀, 喇, or 㗎, but keep it light and not exaggerated.",
      "Good style example for a read answer: 多比幫你睇到，下次產檢係 6 月 23 號下午 3 點半呀。",
      "Good style example for a write answer: 多比已經幫你記低咗用咗 1 卷廁紙呀，現時仲剩返 13 卷。",
      "Do not overdo catchphrases. Keep replies concise, but let the persona feel recognizably present in the wording.",
      ...(this.persona.replyStylePrompt ? [`Persona-specific reply style: ${this.persona.replyStylePrompt}`] : []),
      `Telegram user ID: ${telegramUserId || ""}`,
      ...(senderIdentityBlock ? ["", senderIdentityBlock] : []),
      "",
      localTimeBlock,
      ...(dobbyIntelligenceBlock ? ["", dobbyIntelligenceBlock] : []),
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
        last_reply_text: applyPersonaReplyStyle(envelope.reply_text || question, { mode: "clarify" }),
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + pendingClarificationTtlMs).toISOString(),
      });
      return {
        text: applyPersonaReplyStyle(question, { mode: "clarify" }),
        reply_markup: pendingChoices.length > 0 ? buildInlineKeyboard(pendingChoices) : null,
      };
    }

    chatState.pending_choices = [];
    chatState.pending_clarification = null;
    return {
      text: applyPersonaReplyStyle(envelope.reply_text, { mode: envelope.status === "desktop_required" ? "desktop_required" : "reply" }),
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

  tryDirectBbCalendarAppointmentTurn(userText, telegramUserId = "") {
    const parsed = parseDirectBbCalendarAppointmentRequest(userText);
    if (!parsed) return null;

    const senderIdentity = this.reminderRecipientMap[String(telegramUserId || "")] || null;
    const commandRequest = {
      command_id: "bb_inventory_api",
      argv: [
        "append_bb_calendar_event",
        "--payload-json",
        JSON.stringify({
          event_type: parsed.event_type,
          title: parsed.title,
          start_at: parsed.start_at,
          duration_minutes: parsed.duration_minutes,
          location: parsed.location,
          description: parsed.description,
          owner_person_id: senderIdentity?.primary_person_id || "",
          related_person_id: parsed.related_person_id,
          priority: "medium",
          status: "open",
          remarks: "Recorded through Dobby Intelligence Layer v1 deterministic BB calendar path.",
        }),
        "--request-text",
        `${userText}\nDobby Intelligence Layer v1 deterministic BB calendar write.`,
      ],
    };
    const execution = this.executeBridgeCommand(commandRequest);
    const executionEntry = {
      command_request: {
        command_id: commandRequest.command_id,
        argv: [...commandRequest.argv],
      },
      execution,
    };
    if (!execution.ok) {
      return {
        status: "desktop_required",
        reply_text: "呢個似係BB日程，但Google Calendar暫時寫入唔成功；多比唔會改寫成普通提醒，避免記錯位置。請稍後再試或用Desktop檢查Calendar設定。",
        clarification: null,
        command_request: null,
        latest_successful_execution: null,
        successful_executions: [],
      };
    }

    return {
      status: "reply",
      reply_text: buildDirectBbCalendarAppointmentReply(parsed, execution),
      clarification: null,
      command_request: null,
      latest_successful_execution: executionEntry,
      successful_executions: [executionEntry],
    };
  }

  tryDirectExplicitInventoryConsumeTurn(userText) {
    const parsed = parseExplicitInventoryConsumeRequest(userText);
    if (!parsed) return null;
    const parsedItems = Array.isArray(parsed.items) && parsed.items.length > 0
      ? parsed.items
      : [parsed];

    const snapshotExecution = this.executeBridgeCommand({
      command_id: "bb_inventory_api",
      argv: [
        "get_inventory_snapshot",
        "--request-text",
        userText,
      ],
    });
    if (!snapshotExecution.ok) return null;

    const snapshot = Array.isArray(snapshotExecution?.parsed_json?.result)
      ? snapshotExecution.parsed_json.result
      : [];
    if (snapshot.length === 0) return null;

    const resolution = resolveExplicitConsumeBatchItems(parsed, parsedItems, snapshot);
    if (resolution.clarification) {
      return {
        status: "clarify",
        reply_text: resolution.clarification.question,
        clarification: resolution.clarification,
        command_request: null,
        latest_successful_execution: null,
        successful_executions: [],
      };
    }
    const items = resolution.items || [];
    if (items.length === 0) return null;

    const commandRequest = {
      command_id: "bb_inventory_api",
      argv: [
        "record_inventory_consume_batch",
        "--payload-json",
        JSON.stringify({
          items,
        }),
        "--request-text",
        `${userText}\nDeterministic explicit inventory consume fallback.`,
      ],
    };
    const execution = this.executeBridgeCommand(commandRequest);
    if (!execution.ok) {
      return null;
    }

    return {
      status: "reply",
      reply_text: buildDirectInventoryConsumeReply(items, execution),
      clarification: null,
      command_request: null,
      latest_successful_execution: {
        command_request: {
          command_id: commandRequest.command_id,
          argv: [...commandRequest.argv],
        },
        execution,
      },
      successful_executions: [{
        command_request: {
          command_id: commandRequest.command_id,
          argv: [...commandRequest.argv],
        },
        execution,
      }],
    };
  }

  tryDirectExplicitInventoryRestockBatchTurn(userText) {
    const parsed = parseExplicitInventoryRestockBatchRequest(userText);
    if (!parsed) return null;

    const snapshotExecution = this.executeBridgeCommand({
      command_id: "bb_inventory_api",
      argv: [
        "get_inventory_snapshot",
        "--request-text",
        userText,
      ],
    });
    if (!snapshotExecution.ok) return null;

    const snapshot = Array.isArray(snapshotExecution?.parsed_json?.result)
      ? snapshotExecution.parsed_json.result
      : [];
    if (snapshot.length === 0) return null;

    const resolution = resolveExplicitRestockBatchItems(parsed, snapshot);
    if (resolution.clarification) {
      return {
        status: "clarify",
        reply_text: resolution.clarification.question,
        clarification: resolution.clarification,
        command_request: null,
        latest_successful_execution: null,
        successful_executions: [],
      };
    }
    if (!Array.isArray(resolution.items) || resolution.items.length === 0) {
      return null;
    }

    const commandRequest = {
      command_id: "bb_inventory_api",
      argv: [
        "record_inventory_purchase_batch",
        "--payload-json",
        JSON.stringify({
          items: resolution.items.map((item) => ({
            item_id: item.item_id,
            item_name: item.item_name,
            unit: item.unit,
            quantity: item.quantity,
            remarks: "Restocked through deterministic explicit batch restock fallback.",
          })),
        }),
        "--request-text",
        `${userText}\nDeterministic explicit batch restock fallback.`,
      ],
    };
    const execution = this.executeBridgeCommand(commandRequest);
    if (!execution.ok) return null;

    return {
      status: "reply",
      reply_text: buildDirectInventoryRestockReply(resolution.items, execution),
      clarification: null,
      command_request: null,
      latest_successful_execution: {
        command_request: {
          command_id: commandRequest.command_id,
          argv: [...commandRequest.argv],
        },
        execution,
      },
      successful_executions: [{
        command_request: {
          command_id: commandRequest.command_id,
          argv: [...commandRequest.argv],
        },
        execution,
      }],
    };
  }

  tryDirectExplicitShoppingTaskDoneTurn(userText, chatState) {
    const parsed = parseExplicitShoppingTaskDoneRequest(userText);
    if (!parsed) return null;

    const recentTasks = extractOpenTaskRowsFromChatState(chatState);
    const recentMatch = findUniqueShoppingTaskMatch(recentTasks, parsed.subject);
    const successfulExecutions = [];
    if (recentMatch) {
      const updateExecution = this.executeDirectShoppingTaskDoneUpdate(recentMatch, userText);
      if (!updateExecution?.execution?.ok) return null;
      successfulExecutions.push(updateExecution);
      return buildDirectShoppingTaskDoneEnvelope(parsed.subject, recentMatch, updateExecution, successfulExecutions);
    }

    const queryCommandRequest = {
      command_id: "bb_inventory_api",
      argv: [
        "query_tasks",
        "--payload-json",
        JSON.stringify({
          status: "open",
          limit: 20,
        }),
        "--request-text",
        userText,
      ],
    };
    const queryExecution = this.executeBridgeCommand(queryCommandRequest);
    if (!queryExecution.ok) return null;
    successfulExecutions.push({
      command_request: {
        command_id: queryCommandRequest.command_id,
        argv: [...queryCommandRequest.argv],
      },
      execution: queryExecution,
    });

    const queriedTasks = Array.isArray(queryExecution?.parsed_json?.result)
      ? queryExecution.parsed_json.result
      : [];
    const queriedMatch = findUniqueShoppingTaskMatch(queriedTasks, parsed.subject);
    if (!queriedMatch) return null;

    const updateExecution = this.executeDirectShoppingTaskDoneUpdate(queriedMatch, userText);
    if (!updateExecution?.execution?.ok) return null;
    successfulExecutions.push(updateExecution);
    return buildDirectShoppingTaskDoneEnvelope(parsed.subject, queriedMatch, updateExecution, successfulExecutions);
  }

  executeDirectShoppingTaskDoneUpdate(task, userText) {
    const taskId = String(task?.task_id || task?.entity_id || "").trim();
    if (!taskId) {
      return {
        ok: false,
      };
    }
    const commandRequest = {
      command_id: "bb_inventory_api",
      argv: [
        "update_task",
        "--payload-json",
        JSON.stringify({
          task_id: taskId,
          patch: {
            status: "done",
            remarks: "Marked done through deterministic explicit shopping task completion fallback.",
          },
        }),
        "--request-text",
        `${userText}\nDeterministic explicit shopping task completion fallback.`,
      ],
    };
    const execution = this.executeBridgeCommand(commandRequest);
    return {
      command_request: {
        command_id: commandRequest.command_id,
        argv: [...commandRequest.argv],
      },
      execution,
    };
  }

  tryDirectHouseholdMemoryTurn(userText) {
    const parsed = parseDirectHouseholdMemoryRequest(userText);
    if (!parsed) return null;

    if (parsed.action === "append") {
      const commandRequest = {
        command_id: "bb_inventory_api",
        argv: [
          "append_household_memory",
          "--payload-json",
          JSON.stringify({
            memory_type: parsed.memory_type,
            subject: parsed.subject,
            value_text: parsed.value_text,
            location: parsed.location,
            status: "active",
            confidence: "confirmed",
            remarks: "Recorded through Dobby Intelligence Layer v1 deterministic memory path.",
          }),
          "--request-text",
          `${userText}\nDobby Intelligence Layer v1 deterministic household memory save.`,
        ],
      };
      const execution = this.executeBridgeCommand(commandRequest);
      if (!execution.ok) return null;
      return {
        status: "reply",
        reply_text: `${parsed.subject}放咗喺${parsed.location}，已經記低咗。`,
        clarification: null,
        command_request: null,
        latest_successful_execution: {
          command_request: {
            command_id: commandRequest.command_id,
            argv: [...commandRequest.argv],
          },
          execution,
        },
        successful_executions: [{
          command_request: {
            command_id: commandRequest.command_id,
            argv: [...commandRequest.argv],
          },
          execution,
        }],
      };
    }

    const commandRequest = {
      command_id: "bb_inventory_api",
      argv: [
        "query_household_memory",
        "--payload-json",
        JSON.stringify({
          memory_type: "item_location",
          subject: parsed.subject,
          query_text: parsed.subject,
          status: "active",
          limit: 5,
        }),
        "--request-text",
        `${userText}\nDobby Intelligence Layer v1 deterministic household memory query.`,
      ],
    };
    const execution = this.executeBridgeCommand(commandRequest);
    if (!execution.ok) return null;
    const rows = Array.isArray(execution?.parsed_json?.result)
      ? execution.parsed_json.result
      : [];
    return {
      status: "reply",
      reply_text: buildHouseholdMemoryQueryReply(parsed.subject, rows),
      clarification: null,
      command_request: null,
      latest_successful_execution: {
        command_request: {
          command_id: commandRequest.command_id,
          argv: [...commandRequest.argv],
        },
        execution,
      },
      successful_executions: [{
        command_request: {
          command_id: commandRequest.command_id,
          argv: [...commandRequest.argv],
        },
        execution,
      }],
    };
  }

  tryDirectInventorySafetyStockTurn(userText) {
    const parsed = parseDirectInventorySafetyStockRequest(userText);
    if (!parsed) return null;

    const snapshotExecution = this.executeBridgeCommand({
      command_id: "bb_inventory_api",
      argv: [
        "get_inventory_snapshot",
        "--request-text",
        userText,
      ],
    });
    if (!snapshotExecution.ok) return null;

    const snapshot = Array.isArray(snapshotExecution?.parsed_json?.result)
      ? snapshotExecution.parsed_json.result
      : [];
    if (snapshot.length === 0) return null;

    const match = resolveInventoryMatch(snapshot, parsed.item_name, {
      requireExisting: true,
    });
    if (match.type === "ambiguous") {
      const clarification = buildInventoryBatchItemAmbiguityClarification(
        {
          original_text: userText,
          quantity: parsed.safety_stock,
        },
        parsed.item_name,
        match.candidates,
      );
      return {
        status: "clarify",
        reply_text: clarification.question,
        clarification,
        command_request: null,
        latest_successful_execution: null,
        successful_executions: [],
      };
    }
    if (!match.row || !["exact", "strong"].includes(match.type)) {
      const clarification = buildInventoryBatchUnknownItemClarification(parsed.item_name, match.candidates || []);
      return {
        status: "clarify",
        reply_text: clarification.question,
        clarification,
        command_request: null,
        latest_successful_execution: null,
        successful_executions: [],
      };
    }

    const commandRequest = {
      command_id: "bb_inventory_api",
      argv: [
        "upsert_inventory_item",
        "--payload-json",
        JSON.stringify({
          item_id: match.row.item_id,
          item_name: match.row.item_name,
          unit: match.row.unit,
          safety_stock: parsed.safety_stock,
          remarks: "Updated safety stock through Dobby Intelligence Layer v1 deterministic safety-stock path.",
        }),
        "--request-text",
        `${userText}\nDobby Intelligence Layer v1 deterministic safety-stock update.`,
      ],
    };
    const execution = this.executeBridgeCommand(commandRequest);
    if (!execution.ok) return null;

    return {
      status: "reply",
      reply_text: `${match.row.item_name}安全存量已經設定為 ${formatInventoryQuantityForUser(parsed.safety_stock)} ${formatInventoryUnitForUser(match.row.unit)}。`,
      clarification: null,
      command_request: null,
      latest_successful_execution: {
        command_request: {
          command_id: commandRequest.command_id,
          argv: [...commandRequest.argv],
        },
        execution,
      },
      successful_executions: [{
        command_request: {
          command_id: commandRequest.command_id,
          argv: [...commandRequest.argv],
        },
        execution,
      }],
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
    location: String(source.location || "").trim(),
    memory_type: String(source.memory_type || "").trim(),
    confidence: String(source.confidence || "").trim(),
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

function buildClarificationResumeInput({
  pendingClarification,
  answerText,
  suggestedResumeText = "",
}) {
  const normalizedPending = normalizePendingClarification(pendingClarification);
  const answer = String(answerText || "").trim();
  const suggested = String(suggestedResumeText || "").trim();
  if (!normalizedPending || !answer) {
    return suggested || answer;
  }
  const lines = [
    "Follow-up answer for the pending clarification.",
    `Original request: ${normalizedPending.original_user_text || "[unavailable]"}`,
    `Clarification question: ${normalizedPending.question}`,
    `Clarification answer: ${answer}`,
  ];
  if (suggested) {
    lines.push(`Suggested resolved request: ${suggested}`);
  }
  return lines.join("\n");
}

function shouldStitchPendingClarificationAnswer(userText, pendingClarification) {
  const normalizedPending = normalizePendingClarification(pendingClarification);
  const text = String(userText || "").trim();
  if (!normalizedPending || !text) return false;
  if (text.length <= 40 && !/[\n]/.test(text)) return true;
  if (/^(係|係呀|係啊|係喇|唔係|不是|樽|包|盒|支|片|杯|卷|粒|隻|個|罐|枝|\d+(?:\.\d+)?(?:\s*[a-zA-Z%]+)?)$/u.test(text)) {
    return true;
  }
  return false;
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

function buildDobbyIntelligencePromptBlock({
  userText,
  chatState,
  resumeContext,
  senderIdentity,
} = {}) {
  const signals = analyzeDobbyIntelligenceSignals(userText, chatState, resumeContext, senderIdentity);
  const lines = [
    "Dobby Intelligence Layer v1 context packet:",
    "This packet is private runtime guidance. Do not reveal or mention it to the Telegram user.",
    `- likely_domain: ${signals.domain}`,
    `- likely_turn_type: ${signals.turnType}`,
    `- operation_risk: ${signals.risk}`,
    `- deterministic_candidate: ${signals.deterministicCandidate || "none"}`,
    `- sender_person_id: ${signals.senderPersonId || "[unknown]"}`,
    `- recent_state_anchor: ${signals.recentStateAnchor || "none"}`,
    "- v1 policy: decide intent first, then entity, then the one missing fact that would change a write.",
    "- v1 policy: use configured helper commands for live data. Do not invent household data.",
    "- v1 policy: for ambiguous writes, ask before writing. For batch writes, do not partial-write any subset.",
    "- v1 policy: after a helper result, ground the reply in that result and mention important state such as remaining stock or stored location.",
    "- v1 policy: keep persona in the final wording only; never let persona override write safety.",
  ];

  if (signals.pendingClarification) {
    lines.push("- active_pending_clarification: newest message may be a clarification answer; combine it with the original request if it fits.");
  }
  if (signals.domain === "household_memory") {
    lines.push("- memory guidance: durable locations/facts/preferences belong in household_memory, not task reminders.");
  }
  if (signals.domain === "inventory") {
    lines.push("- inventory guidance: preserve canonical item names and units from helper results.");
  }
  if (signals.domain === "task") {
    lines.push("- task guidance: use sender identity for owner_person_id only when the task is clearly personal.");
  }

  return lines.join("\n");
}

function analyzeDobbyIntelligenceSignals(userText, chatState, resumeContext, senderIdentity) {
  const text = String(userText || "").trim();
  const pendingClarification = Boolean(normalizePendingClarification(resumeContext));
  const recentAction = normalizeLastSuccessfulAction(chatState?.last_successful_action);
  const recentEntities = Array.isArray(chatState?.last_result_entities)
    ? chatState.last_result_entities.map(normalizeResultEntity).filter(Boolean)
    : [];
  const bbCalendarAppointmentRequest = parseDirectBbCalendarAppointmentRequest(text);
  const memoryRequest = parseDirectHouseholdMemoryRequest(text);
  const safetyStockRequest = parseDirectInventorySafetyStockRequest(text);
  const restockBatchRequest = parseExplicitInventoryRestockBatchRequest(text);
  const consumeRequest = parseExplicitInventoryConsumeRequest(text);
  const shoppingDoneRequest = parseExplicitShoppingTaskDoneRequest(text);

  let domain = "general_household";
  let turnType = pendingClarification ? "clarification_followup" : "new_request";
  let risk = "normal";
  let deterministicCandidate = "";

  if (bbCalendarAppointmentRequest) {
    domain = "baby";
    turnType = "bb_calendar_write";
    risk = "state_changing_write";
    deterministicCandidate = "bb_calendar_appointment";
  } else if (memoryRequest) {
    domain = "household_memory";
    turnType = memoryRequest.action === "append" ? "memory_write" : "memory_read";
    risk = memoryRequest.action === "append" ? "state_changing_write" : "read";
    deterministicCandidate = `household_memory_${memoryRequest.action}`;
  } else if (safetyStockRequest) {
    domain = "inventory";
    turnType = "inventory_safety_stock_update";
    risk = "state_changing_write";
    deterministicCandidate = "inventory_safety_stock";
  } else if (restockBatchRequest) {
    domain = "inventory";
    turnType = "inventory_batch_restock";
    risk = "state_changing_write_batch";
    deterministicCandidate = "inventory_batch_restock";
  } else if (consumeRequest) {
    domain = "inventory";
    turnType = "inventory_consume";
    risk = "state_changing_write";
    deterministicCandidate = "inventory_consume";
  } else if (shoppingDoneRequest) {
    domain = "task";
    turnType = "task_completion";
    risk = "state_changing_write";
    deterministicCandidate = "shopping_task_done";
  } else if (/(提醒|task|todo|待辦|要做|提我|提太太|幾時)/iu.test(text)) {
    domain = "task";
    turnType = /幾時|查|睇|有咩|what|when/iu.test(text) ? "task_read" : "task_write";
    risk = turnType === "task_write" ? "state_changing_write" : "read";
  } else if (/(買|買咗|買左|用咗|用左|食咗|食左|飲咗|飲左|存貨|安全存量|最低存量|過期|要買)/iu.test(text)) {
    domain = "inventory";
    turnType = /有咩|幾多|仲有|過期|要買/iu.test(text) ? "inventory_read" : "inventory_write";
    risk = turnType === "inventory_write" ? "state_changing_write" : "read";
  } else if (/(BB|飲奶|換片|瞓|體溫|打針)/iu.test(text)) {
    domain = "baby";
    turnType = /幾時|最近|查|睇/iu.test(text) ? "baby_read" : "baby_write";
    risk = turnType === "baby_write" ? "state_changing_write" : "read";
  }

  return {
    domain,
    turnType,
    risk,
    deterministicCandidate,
    pendingClarification,
    senderPersonId: senderIdentity?.primary_person_id || "",
    recentStateAnchor: recentAction
      ? `${recentAction.actions.join(",")} ${recentEntities.slice(0, 3).map((entity) => entity.name || entity.entity_id).filter(Boolean).join(" | ")}`.trim()
      : "",
  };
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
  const recentWrite = ["append_task", "update_task", "append_baby_log", "append_bb_calendar_event", "record_inventory_purchase_batch", "record_inventory_consume_batch", "set_inventory_stock_level", "update_inventory_expiry_date", "upsert_inventory_item", "append_household_memory"]
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
    "append_bb_calendar_event",
  ]).has(action);
}

function extractResultEntitiesFromExecution(action, result) {
  const normalizedAction = String(action || "").trim();
  if (!normalizedAction) return [];
  if (["append_task", "update_task"].includes(normalizedAction)) {
    const entity = buildTaskResultEntity(result);
    return entity ? [entity] : [];
  }
  if (normalizedAction === "append_bb_calendar_event") {
    return buildBbCalendarResultEntities(result);
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

function buildBbCalendarResultEntities(result) {
  const source = result && typeof result === "object" ? result : {};
  const calendarEvent = source.calendar_event && typeof source.calendar_event === "object"
    ? source.calendar_event
    : {};
  const entities = [];
  const calendarEntity = normalizeResultEntity({
    kind: "bb_calendar_event",
    entity_id: calendarEvent.calendar_event_id,
    name: calendarEvent.title,
    due_at: calendarEvent.start_at,
    status: "open",
    category: calendarEvent.event_type || "bb_calendar",
    location: calendarEvent.location,
  });
  if (calendarEntity) entities.push(calendarEntity);
  const taskEntity = buildTaskResultEntity(source.task);
  if (taskEntity) entities.push(taskEntity);
  return entities;
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
  if (["query_tasks", "update_task", "append_task", "append_bb_calendar_event"].includes(action)) {
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

function buildDirectInventoryConsumeReply(items, execution) {
  const summary = (Array.isArray(items) ? items : [])
    .map((item) => {
      const itemName = String(item?.item_name || "").trim();
      if (!itemName) return "";
      return `${formatInventoryQuantityForUser(item.quantity)} ${formatInventoryUnitForUser(item.unit)}${itemName}`;
    })
    .filter(Boolean)
    .join("、");
  const replyText = summary ? `已幫你扣減咗 ${summary}。` : "已經幫你扣減咗相關存貨。";
  return appendInventoryRemainingSummaryIfMissing(replyText, {
    command_request: {
      argv: ["record_inventory_consume_batch"],
    },
    execution,
  });
}

function buildDirectInventoryRestockReply(items, execution) {
  const rows = Array.isArray(items) ? items : [];
  const summary = rows
    .slice(0, 8)
    .map((item) => `${item.item_name} ${formatInventoryQuantityForUser(item.quantity)} ${formatInventoryUnitForUser(item.unit)}`)
    .filter(Boolean)
    .join("、");
  const replyText = summary
    ? `已經幫你入返 ${rows.length} 樣存貨：${summary}。`
    : "已經幫你入返相關存貨。";
  return appendInventoryRemainingSummaryIfMissing(replyText, {
    command_request: {
      argv: ["record_inventory_purchase_batch"],
    },
    execution,
  });
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

function parseDirectBbCalendarAppointmentRequest(userText) {
  const text = stripDobbyInvocation(String(userText || "").normalize("NFKC").trim());
  if (!text) return null;
  if (!looksLikeBbCalendarAppointmentText(text)) return null;

  const dateParts = parseBbCalendarDateParts(text);
  const timeParts = parseBbCalendarTimeParts(text);
  if (!dateParts || !timeParts) return null;

  const year = resolveBbCalendarYear(dateParts.year, dateParts.month, dateParts.day);
  if (!isValidBbCalendarDate(year, dateParts.month, dateParts.day)) return null;
  if (!isValidBbCalendarTime(timeParts.hour, timeParts.minute)) return null;

  const eventType = inferBbCalendarEventType(text);
  const location = extractBbCalendarLocation(text);
  const title = buildDirectBbCalendarTitle(eventType, location);
  const startAt = [
    `${year}-${pad2(dateParts.month)}-${pad2(dateParts.day)}`,
    `${pad2(timeParts.hour)}:${pad2(timeParts.minute)}:00+08:00`,
  ].join(" ");

  return {
    event_type: eventType,
    title,
    start_at: startAt,
    duration_minutes: 60,
    location,
    description: title,
    related_person_id: eventType === "prenatal_check" ? "per_wife" : "per_baby",
  };
}

function stripDobbyInvocation(value) {
  return String(value || "")
    .trim()
    .replace(/^[\s,，。.!！?？]*(?:多比|dobby|Dobby|多啦B夢|多啦B梦){1,2}\s*[,，。.!！?？]*/u, "")
    .trim();
}

function looksLikeBbCalendarAppointmentText(text) {
  const value = String(text || "");
  const hasBabyTarget = /(?:\bBB\b|baby|寶寶|小桃B|小桃)/iu.test(value);
  const hasAppointmentKeyword = /(?:覆診|複診|打針|疫苗|母嬰院|醫院|診所|覆查|檢查|產檢|checkup|follow[-\s]?up)/iu.test(value);
  const hasWriteVerb = /(?:記得|記低|加入|加到|放入|提我|提醒|日程|calendar|Calendar|Google Calendar)/iu.test(value);
  return hasAppointmentKeyword && (hasBabyTarget || /產檢/u.test(value)) && hasWriteVerb;
}

function parseBbCalendarDateParts(text) {
  const value = String(text || "");
  const iso = value.match(/(?:^|[^\d])(20\d{2})[-/](\d{1,2})[-/](\d{1,2})(?:$|[^\d])/u);
  if (iso) {
    return {
      year: Number(iso[1]),
      month: Number(iso[2]),
      day: Number(iso[3]),
    };
  }

  const chinese = value.match(/(?:(20\d{2})\s*年\s*)?(\d{1,2})\s*月\s*(\d{1,2})\s*(?:日|號|号)?/u);
  if (chinese) {
    return {
      year: chinese[1] ? Number(chinese[1]) : null,
      month: Number(chinese[2]),
      day: Number(chinese[3]),
    };
  }

  const slash = value.match(/(?:^|[^\d])(\d{1,2})[/-](\d{1,2})(?:$|[^\d])/u);
  if (slash) {
    return {
      year: null,
      month: Number(slash[1]),
      day: Number(slash[2]),
    };
  }

  return null;
}

function parseBbCalendarTimeParts(text) {
  const value = String(text || "");
  const colon = value.match(/(?:^|[^\d])(\d{1,2})[:：](\d{2})(?:$|[^\d])/u);
  if (colon) {
    return adjustBbCalendarHourForPeriod({
      hour: Number(colon[1]),
      minute: Number(colon[2]),
      period: extractTimePeriodNear(value, colon.index || 0),
    });
  }

  const hourMinute = value.match(/(早上|上午|朝早|中午|下午|下晝|晚上|夜晚)?\s*(\d{1,2})\s*(?:點|点|時|时)\s*(半|(\d{1,2})\s*分?)?/u);
  if (!hourMinute) return null;
  return adjustBbCalendarHourForPeriod({
    hour: Number(hourMinute[2]),
    minute: hourMinute[3] === "半" ? 30 : Number(hourMinute[4] || 0),
    period: hourMinute[1] || "",
  });
}

function extractTimePeriodNear(text, index) {
  const prefix = String(text || "").slice(Math.max(0, Number(index || 0) - 8), Number(index || 0));
  const match = prefix.match(/(早上|上午|朝早|中午|下午|下晝|晚上|夜晚)\s*$/u);
  return match ? match[1] : "";
}

function adjustBbCalendarHourForPeriod({ hour, minute, period }) {
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  let adjustedHour = hour;
  if (/^(下午|下晝|晚上|夜晚)$/u.test(period) && adjustedHour < 12) adjustedHour += 12;
  if (/^中午$/u.test(period) && adjustedHour < 11) adjustedHour += 12;
  if (/^(早上|上午|朝早)$/u.test(period) && adjustedHour === 12) adjustedHour = 0;
  return {
    hour: adjustedHour,
    minute,
  };
}

function resolveBbCalendarYear(explicitYear, month, day, now = new Date()) {
  if (Number.isInteger(explicitYear) && explicitYear >= 2000 && explicitYear <= 2100) {
    return explicitYear;
  }
  const today = formatHongKongTimestamp(now).slice(0, 10);
  const currentYear = Number(today.slice(0, 4));
  const candidate = `${currentYear}-${pad2(month)}-${pad2(day)}`;
  return candidate < today ? currentYear + 1 : currentYear;
}

function isValidBbCalendarDate(year, month, day) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function isValidBbCalendarTime(hour, minute) {
  return Number.isInteger(hour) && Number.isInteger(minute) && hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

function inferBbCalendarEventType(text) {
  const value = String(text || "");
  if (/產檢/u.test(value)) return "prenatal_check";
  if (/(打針|疫苗)/u.test(value)) return "vaccination";
  if (/(覆診|複診|覆查)/u.test(value)) return "clinic_visit";
  if (/(醫生|睇醫生)/u.test(value)) return "doctor_visit";
  if (/(檢查|checkup)/iu.test(value)) return "checkup";
  return "other";
}

function extractBbCalendarLocation(text) {
  const value = String(text || "");
  const beforeAppointment = value.match(/(?:係|喺|在)\s*([^係喺在，,。；;\n]+?)\s*(?:覆診|複診|覆查|打針|疫苗|產檢|檢查|checkup|follow[-\s]?up)/iu);
  if (beforeAppointment) return cleanBbCalendarLocation(beforeAppointment[1]);

  const knownPlace = value.match(/([^，,。；;\s\n]+(?:醫院|母嬰院|診所))/u);
  if (knownPlace) return cleanBbCalendarLocation(knownPlace[1]);

  return "";
}

function cleanBbCalendarLocation(value) {
  return String(value || "")
    .trim()
    .replace(/^(?:係|喺|在)\s*/u, "")
    .replace(/\s*(?:覆診|複診|覆查|打針|疫苗|產檢|檢查|checkup|follow[-\s]?up).*$/iu, "")
    .replace(/[，,。；;.!！?？]+$/u, "")
    .trim();
}

function buildDirectBbCalendarTitle(eventType, location) {
  const labels = {
    vaccination: "BB打針",
    clinic_visit: "BB覆診",
    doctor_visit: "BB睇醫生",
    checkup: "BB檢查",
    prenatal_check: "產檢",
    other: "BB日程",
  };
  const label = labels[eventType] || labels.other;
  return location ? `${label} - ${location}` : label;
}

function buildDirectBbCalendarAppointmentReply(parsed, execution) {
  const result = execution?.parsed_json?.result || {};
  const event = result.calendar_event || {};
  const task = result.task || {};
  const title = String(event.title || parsed.title || "BB日程").trim();
  const startAt = String(event.start_at || parsed.start_at || "").trim();
  const location = String(event.location || parsed.location || "").trim();
  const taskId = String(task.task_id || "").trim();
  return [
    `已經加入BB Calendar：${title}`,
    startAt ? `時間：${startAt}` : "",
    location ? `地點：${location}` : "",
    taskId ? `同步提醒任務：${taskId}` : "同步提醒任務已建立",
  ].filter(Boolean).join("\n");
}

function pad2(value) {
  return String(Number(value || 0)).padStart(2, "0");
}

function parseDirectHouseholdMemoryRequest(userText) {
  const text = cleanupTelegramUserText(userText);
  if (!text) return null;

  const locationSavePatterns = [
    /^(?:幫我)?(?:記住|記低|記低咗|記低左)\s*(.+?)\s*(?:放咗喺|放左喺|放咗係|放左係|放喺|放係|擺咗喺|擺左喺|擺咗係|擺左係|擺喺|擺係|收咗喺|收左喺|收喺|收係|喺|係)\s*(.+)$/iu,
    /^(.+?)\s*(?:放咗喺|放左喺|放咗係|放左係|放喺|放係|擺咗喺|擺左喺|擺咗係|擺左係|擺喺|擺係|收咗喺|收左喺|收喺|收係)\s*(.+?)(?:，?幫我(?:記住|記低))?$/iu,
    /^(.+?)\s*(?:而家|依家|現在)?\s*(?:搬咗去|搬左去|移咗去|移左去|改放喺|改放係|改擺喺|改擺係)\s*(.+)$/iu,
  ];
  for (const pattern of locationSavePatterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const subject = cleanupMemorySubject(match[1]);
    const location = cleanupMemoryLocation(match[2]);
    if (!isSafeMemorySubject(subject) || !isSafeMemoryLocation(location)) continue;
    return {
      action: "append",
      memory_type: "item_location",
      subject,
      location,
      value_text: `放咗喺${location}`,
    };
  }

  const locationQueryPatterns = [
    /^(.+?)(?:放咗喺邊|放左喺邊|放咗係邊|放左係邊|放喺邊|放係邊|放咗去邊|放左去邊|擺咗喺邊|擺左喺邊|擺咗係邊|擺左係邊|擺喺邊|擺係邊|擺咗去邊|擺左去邊|搬咗去邊|搬左去邊|喺邊|係邊|去咗邊|去左邊)$/iu,
    /^(?:幫我)?(?:搵|查|睇)\s*(.+?)\s*(?:放咗喺邊|放左喺邊|放喺邊|放係邊|放咗去邊|放左去邊|喺邊|係邊|位置)$/iu,
  ];
  for (const pattern of locationQueryPatterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const subject = cleanupMemorySubject(match[1]);
    if (!isSafeMemorySubject(subject)) continue;
    return {
      action: "query",
      memory_type: "item_location",
      subject,
    };
  }

  return null;
}

function parseDirectInventorySafetyStockRequest(userText) {
  const text = cleanupTelegramUserText(userText);
  if (!text) return null;
  const patterns = [
    /^(?:幫我)?(?:設定返|設定|set|改返|改|調返|調)\s*(.+?)\s*(?:嘅|的)?\s*(?:安全存量|安全庫存|安全，?存量|安全|最低存量|最低庫存|minimum stock|safety stock)\s*(?:係|為|做|到|=|:)?\s*([0-9.一二兩三四五六七八九十半]+)\s*([^\s]*)$/iu,
    /^(.+?)\s*(?:嘅|的)?\s*(?:安全存量|安全庫存|最低存量|最低庫存|minimum stock|safety stock)\s*(?:係|為|做|到|=|:)?\s*([0-9.一二兩三四五六七八九十半]+)\s*([^\s]*)$/iu,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const itemName = cleanupInventorySubject(match[1]);
    const safetyStock = parseHumanQuantity(match[2]);
    if (!itemName || !Number.isFinite(safetyStock) || safetyStock < 0) continue;
    return {
      item_name: itemName,
      safety_stock: safetyStock,
      raw_unit: String(match[3] || "").trim(),
    };
  }
  return null;
}

function cleanupTelegramUserText(value) {
  return String(value || "")
    .trim()
    .replace(/^[\s,，。.!！?？]*(?:多比|dobby|Dobby|多啦B夢|多啦B梦)\s*/u, "")
    .replace(/^[\s,，。.!！?？]*(?:你)?\s*/u, "")
    .replace(/[。.!！?？\s]+$/u, "")
    .trim();
}

function cleanupMemorySubject(value) {
  return String(value || "")
    .trim()
    .replace(/^(?:幫我|請你|你幫我|記住|記低)\s*/u, "")
    .replace(/(?:嘅|的)?(?:位置|地方)$/u, "")
    .replace(/[「」"']/gu, "")
    .trim();
}

function cleanupMemoryLocation(value) {
  return String(value || "")
    .trim()
    .replace(/^(?:喺|係)\s*/u, "")
    .replace(/[「」"']/gu, "")
    .replace(/[。.!！?？]+$/u, "")
    .trim();
}

function cleanupInventorySubject(value) {
  return String(value || "")
    .trim()
    .replace(/^(?:幫我|請你|你幫我|設定返|設定|改返|改|調返|調)\s*/u, "")
    .replace(/(?:嘅|的)$/u, "")
    .replace(/[「」"']/gu, "")
    .trim();
}

function isSafeMemorySubject(value) {
  const text = String(value || "").trim();
  if (!text || text.length > 80) return false;
  return !/(提醒|提我|幾時|要買|存貨|安全存量|最低存量|過期)/iu.test(text);
}

function isSafeMemoryLocation(value) {
  const text = String(value || "").trim();
  if (!text || text.length > 80) return false;
  return !/(幾時|提醒|提我|要買|過期)/iu.test(text);
}

function parseHumanQuantity(value) {
  const parsed = parseLooseCountValue(value);
  if (Number.isFinite(parsed)) return parsed;
  const text = String(value || "").trim();
  const digits = {
    零: 0,
    〇: 0,
    半: 0.5,
    一: 1,
    二: 2,
    兩: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
    十: 10,
  };
  if (Object.prototype.hasOwnProperty.call(digits, text)) {
    return digits[text];
  }
  const teen = text.match(/^十([一二兩两三四五六七八九])$/u);
  if (teen) return 10 + digits[teen[1]];
  const tens = text.match(/^([二兩两三四五六七八九])十([一二兩两三四五六七八九])?$/u);
  if (tens) return digits[tens[1]] * 10 + (tens[2] ? digits[tens[2]] : 0);
  return Number.NaN;
}

function buildHouseholdMemoryQueryReply(subject, rows) {
  const memories = Array.isArray(rows) ? rows.filter((row) => row && typeof row === "object") : [];
  if (memories.length === 0) {
    return `暫時未搵到「${subject}」嘅位置記錄。`;
  }
  const lines = memories
    .slice(0, 3)
    .map((memory) => {
      const memorySubject = String(memory.subject || subject || "").trim();
      const location = String(memory.location || "").trim();
      const valueText = String(memory.value_text || "").trim();
      if (location) return `${memorySubject}：${location}`;
      if (valueText) return `${memorySubject}：${valueText}`;
      return memorySubject;
    })
    .filter(Boolean);
  if (lines.length === 1) {
    return `記得呀，${lines[0]}。`;
  }
  return `搵到幾條可能相關嘅記錄：\n${lines.map((line) => `- ${line}`).join("\n")}`;
}

function parseExplicitInventoryConsumeRequest(userText) {
  const text = String(userText || "").trim();
  if (!text) return null;

  const clarification = parseClarificationResumeText(text);
  const sourceText = clarification?.suggested && looksLikeExplicitInventoryConsumeText(clarification.suggested)
    ? clarification.suggested
    : clarification?.originalRequest || text;
  const direct = parseDirectExplicitInventoryConsumeText(sourceText);
  if (!direct) return null;

  return {
    ...direct,
    clarification_answer: clarification?.answer || "",
    clarification_suggested: clarification?.suggested || "",
  };
}

function looksLikeExplicitInventoryConsumeText(value) {
  return /(?:食咗|食左|飲咗|飲左|用咗|用左|開咗|開左)\s*/u.test(String(value || ""));
}

function parseDirectExplicitInventoryConsumeText(userText) {
  const text = String(userText || "").trim();
  if (!text) return null;
  const match = text.match(/(?:^|.*?\s)?(?:啱啱)?(?:食咗|食左|飲咗|飲左|用咗|用左|開咗|開左)\s*(.+)$/u);
  if (!match) return null;

  const itemClauses = splitExplicitConsumeItemClauses(match[1]);
  const items = itemClauses
    .map((clause) => parseExplicitConsumeItemClause(clause))
    .filter(Boolean);
  if (items.length === 0 || items.length !== itemClauses.length) {
    return null;
  }
  return {
    ...items[0],
    items,
    original_text: text,
  };
}

function splitExplicitConsumeItemClauses(value) {
  const text = String(value || "")
    .trim()
    .replace(/[。！!？?]+$/u, "")
    .replace(/\s+/gu, " ");
  if (!text) return [];
  return text
    .split(/\s*(?:[,，、;；]\s*(?:同埋|同|及|和|仲有|還有)?\s*|(?:同埋|同|及|和|仲有|還有)\s*)(?=[0-9一二兩三四五六七八九十百半])/u)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseExplicitConsumeItemClause(value) {
  const text = String(value || "")
    .trim()
    .replace(/^[,，、;；\s]*(?:同埋|同|及|和|仲有|還有)?\s*/u, "")
    .replace(/[。！!？?]+$/u, "");
  if (!text) return null;
  const match = text.match(/^([0-9一二兩三四五六七八九十百半]+(?:\.[0-9]+)?)\s*([個件粒隻片包盒樽支瓶罐杯卷]*)\s*(.+)$/u);
  if (!match) return null;
  const quantity = parseLooseCountValue(match[1]);
  const itemName = String(match[3] || "").trim().replace(/[。！!？?]+$/u, "");
  if (!Number.isFinite(quantity) || quantity <= 0 || !itemName) {
    return null;
  }
  return {
    quantity,
    unit: String(match[2] || "").trim(),
    item_name: itemName,
  };
}

function resolveExplicitConsumeBatchItems(parsed, parsedItems, snapshot) {
  const items = [];
  const answer = String(parsed?.clarification_answer || "").trim();
  const suggested = String(parsed?.clarification_suggested || "").trim();
  for (const parsedItem of parsedItems || []) {
    const preferredUnit = parsedItem.unit ? normalizeInventoryUnitAlias(parsedItem.unit) : "";
    let itemName = parsedItem.item_name;
    let match = resolveInventoryMatch(snapshot, itemName, {
      preferredUnit,
      requireExisting: true,
    });
    if (match.type === "ambiguous" && (answer || suggested)) {
      const resolvedName = resolveAmbiguousInventoryNameFromClarification(itemName, answer, suggested, match.candidates);
      if (resolvedName) {
        itemName = resolvedName;
        match = resolveInventoryMatch(snapshot, itemName, {
          preferredUnit,
          requireExisting: true,
        });
      }
    }
    if (match.type === "ambiguous") {
      return {
        clarification: buildExplicitConsumeItemAmbiguityClarification(parsed, parsedItem, match.candidates),
      };
    }
    if (!match.row || !["exact", "strong"].includes(match.type)) {
      return {
        clarification: buildExplicitConsumeUnknownItemClarification(parsed, parsedItem, match.candidates || []),
      };
    }

    const canonicalUnit = String(match.row.unit || "").trim();
    const resolvedUnit = resolveSafeExplicitConsumeUnit({
      spokenUnit: preferredUnit,
      canonicalUnit,
      quantity: parsedItem.quantity,
    });
    if (!resolvedUnit) {
      return {
        clarification: {
          question: `${match.row.item_name} 平時係用 ${formatInventoryUnitForUser(match.row.unit)} 計，今次你講「${parsedItem.unit || "原本單位"}」係咪即係 1 ${formatInventoryUnitForUser(match.row.unit)}？`,
          allow_free_text: true,
          choices: [],
        },
      };
    }

    items.push({
      item_id: match.row.item_id,
      item_name: match.row.item_name,
      unit: resolvedUnit,
      quantity: parsedItem.quantity,
      remarks: "Consumed through deterministic explicit inventory consume fallback.",
    });
  }
  return { items };
}

function resolveAmbiguousInventoryNameFromClarification(itemName, answer, suggested, candidates = []) {
  const subject = String(itemName || "").trim();
  const answerText = String(answer || "").trim();
  const suggestedText = String(suggested || "").trim();
  const names = (Array.isArray(candidates) ? candidates : [])
    .map((row) => String(row?.item_name || "").trim())
    .filter(Boolean);
  const mappingPattern = new RegExp(`「?${escapeRegex(subject)}」?\\s*(?:即係|就是|係|是)\\s*「?([^」\\n]+)」?`, "u");
  const mapping = mappingPattern.exec([answerText, suggestedText].filter(Boolean).join("\n"));
  if (mapping) {
    const mappedName = String(mapping[1] || "").trim();
    const exactMapped = names.find((name) => name === mappedName);
    if (exactMapped) return exactMapped;
    if (mappedName) return mappedName;
  }
  const exactAnswer = names.find((name) => name === answerText || name === suggestedText);
  if (exactAnswer) return exactAnswer;
  return names.find((name) => answerText.includes(name) || suggestedText.includes(name)) || "";
}

function buildExplicitConsumeItemAmbiguityClarification(parsed, parsedItem, candidates = []) {
  const itemName = String(parsedItem?.item_name || "").trim();
  const names = candidates.slice(0, 3).map((row) => row?.item_name).filter(Boolean);
  return {
    question: names.length > 0
      ? `多比見到「${itemName}」可能係：${names.join("、")}。你想用邊個？`
      : `多比未夠把握「${itemName}」係邊樣存貨，你可以講完整啲個名嗎？`,
    allow_free_text: true,
    choices: names.slice(0, 3).map((name) => ({
      label: name,
      resume_text: buildResolvedExplicitConsumeRequestText(parsed, parsedItem, name),
    })),
  };
}

function buildExplicitConsumeUnknownItemClarification(parsed, parsedItem, candidates = []) {
  const itemName = String(parsedItem?.item_name || "").trim();
  const names = candidates.slice(0, 3).map((row) => row?.item_name).filter(Boolean);
  return {
    question: names.length > 0
      ? `多比暫時未見到「${itemName}」，但見到可能係：${names.join("、")}。你想用邊個？`
      : `多比暫時未見到「${itemName}」呢個現有存貨。你可以講完整啲個名嗎？`,
    allow_free_text: true,
    choices: names.slice(0, 3).map((name) => ({
      label: name,
      resume_text: buildResolvedExplicitConsumeRequestText(parsed, parsedItem, name),
    })),
  };
}

function buildResolvedExplicitConsumeRequestText(parsed, targetItem, resolvedName) {
  const targetName = String(targetItem?.item_name || "").trim();
  const resolved = String(resolvedName || "").trim();
  const items = (Array.isArray(parsed?.items) ? parsed.items : [])
    .map((item) => ({
      ...item,
      item_name: String(item?.item_name || "").trim() === targetName && resolved ? resolved : item.item_name,
    }));
  if (items.length === 0) {
    return String(parsed?.original_text || "").trim();
  }
  return `食咗${items.map((item) => {
    const unit = String(item.unit || "").trim();
    return `${formatInventoryQuantityForUser(item.quantity)} ${unit}${item.item_name}`.trim();
  }).join("，同")}`;
}

function parseExplicitInventoryRestockBatchRequest(userText) {
  const text = String(userText || "").trim();
  if (!text) return null;

  const clarification = parseClarificationResumeText(text);
  const sourceText = clarification?.suggested && looksLikeExplicitInventoryRestockText(clarification.suggested)
    ? clarification.suggested
    : clarification?.originalRequest || text;
  const direct = parseDirectExplicitInventoryRestockBatchText(sourceText)
    || parseDirectExplicitInventorySingleRestockText(sourceText);
  if (!direct) return null;

  return {
    ...direct,
    clarification_answer: clarification?.answer || "",
  };
}

function looksLikeExplicitInventoryRestockText(value) {
  return /(?:買左|買咗|買了|買返|買|入咗|入左|補咗|補左)/u.test(String(value || ""));
}

function parseClarificationResumeText(text) {
  const value = String(text || "");
  const originalMatch = value.match(/Original request:\s*([\s\S]*?)\nClarification question:/u);
  const answerMatch = value.match(/\nClarification answer:\s*([\s\S]*?)(?:\nSuggested resolved request:\s*([\s\S]*))?$/u);
  if (!originalMatch || !answerMatch) return null;
  return {
    originalRequest: String(originalMatch[1] || "").trim(),
    answer: String(answerMatch[1] || "").trim(),
    suggested: String(answerMatch[2] || "").trim(),
  };
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseDirectExplicitInventoryRestockBatchText(userText) {
  const text = String(userText || "")
    .trim()
    .replace(/[。！!？?]+$/u, "");
  if (!text) return null;

  const match = text.match(/^(?:啱啱|剛剛|刚刚|頭先|刚才)?\s*(?:買左|買咗|買了|買返|買|入咗|入左|補咗|補左)\s*(.+?)\s*(?:各|每樣|每款)\s*([0-9一二兩三四五六七八九十半]+(?:\.[0-9]+)?)\s*([支枝樽瓶包盒罐杯個件卷])/u);
  if (!match) return null;

  const quantity = parseLooseCountValue(match[2]);
  const unitInfo = normalizeExplicitRestockUnit(match[3]);
  if (!Number.isFinite(quantity) || quantity <= 0 || !unitInfo.unit) return null;

  const itemNames = splitExplicitRestockBatchItems(match[1]);
  if (itemNames.length < 2 || itemNames.length > 12) return null;

  return {
    original_text: text,
    item_names: itemNames,
    quantity,
    unit: unitInfo.unit,
    raw_unit: String(match[3] || "").trim(),
    unit_is_generic_retail: unitInfo.genericRetail,
  };
}

function parseDirectExplicitInventorySingleRestockText(userText) {
  const text = String(userText || "")
    .trim()
    .replace(/[。！!？?]+$/u, "");
  if (!text) return null;

  const prefix = "(?:啱啱|剛剛|刚刚|頭先|刚才)?";
  const verb = "(?:買左|買咗|買了|買返|買|入咗|入左|補咗|補左)";
  const quantity = "([0-9一二兩三四五六七八九十半]+(?:\\.[0-9]+)?)";
  const unit = "([支枝樽瓶包盒罐杯個件卷隻粒片])";
  const patterns = [
    { pattern: new RegExp(`^${prefix}\\s*${verb}\\s*${quantity}\\s*${unit}\\s*(.+)$`, "u"), quantityIndex: 1, unitIndex: 2, itemIndex: 3 },
    { pattern: new RegExp(`^${prefix}\\s*${verb}\\s*(.+?)\\s*${quantity}\\s*${unit}$`, "u"), quantityIndex: 2, unitIndex: 3, itemIndex: 1 },
    { pattern: new RegExp(`^(.+?)\\s*${verb}\\s*${quantity}\\s*${unit}$`, "u"), quantityIndex: 2, unitIndex: 3, itemIndex: 1 },
  ];

  for (const { pattern, quantityIndex, unitIndex, itemIndex } of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const parsedQuantity = parseLooseCountValue(match[quantityIndex]);
    const unitInfo = normalizeExplicitRestockUnit(match[unitIndex]);
    const itemName = cleanupExplicitRestockSingleItemName(match[itemIndex]);
    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0 || !unitInfo.unit || !itemName) {
      continue;
    }
    return {
      original_text: text,
      item_names: [itemName],
      quantity: parsedQuantity,
      unit: unitInfo.unit,
      raw_unit: String(match[unitIndex] || "").trim(),
      unit_is_generic_retail: unitInfo.genericRetail,
      single_item_restock: true,
    };
  }
  return null;
}

function cleanupExplicitRestockSingleItemName(value) {
  return String(value || "")
    .trim()
    .replace(/^(?:返|咗|左)\s*/u, "")
    .replace(/(?:喇|啦|呀|啊)$/u, "")
    .replace(/[。！!？?]+$/u, "")
    .trim();
}

function normalizeExplicitRestockUnit(unit) {
  const raw = String(unit || "").trim();
  const aliases = new Map([
    ["支", { unit: "piece", genericRetail: true }],
    ["枝", { unit: "piece", genericRetail: true }],
    ["個", { unit: "piece", genericRetail: true }],
    ["件", { unit: "piece", genericRetail: true }],
    ["樽", { unit: "bottle", genericRetail: false }],
    ["瓶", { unit: "bottle", genericRetail: false }],
    ["包", { unit: "pack", genericRetail: false }],
    ["盒", { unit: "box", genericRetail: false }],
    ["罐", { unit: "can", genericRetail: false }],
    ["杯", { unit: "cup", genericRetail: false }],
    ["卷", { unit: "roll", genericRetail: false }],
  ]);
  return aliases.get(raw) || {
    unit: normalizeInventoryUnitAlias(raw),
    genericRetail: false,
  };
}

function splitExplicitRestockBatchItems(value) {
  return String(value || "")
    .replace(/[，,、；;]/gu, " ")
    .replace(/\s+(?:同|和|及)\s+/gu, " ")
    .split(/\s+/u)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function resolveExplicitRestockBatchItems(parsed, snapshot) {
  const answer = String(parsed?.clarification_answer || "").trim();
  const expandedNames = [];
  for (const itemName of parsed.item_names || []) {
    const expanded = expandExplicitRestockItemNameFromClarification(itemName, answer);
    if (expanded.clarification) {
      return {
        clarification: buildExplicitRestockBatchClarification(parsed, expanded.subject),
      };
    }
    expandedNames.push(...expanded.itemNames);
  }

  const items = [];
  for (const itemName of expandedNames) {
    const match = resolveInventoryMatch(snapshot, itemName, {
      preferredUnit: parsed.unit,
      requireExisting: true,
    });
    if (match.type === "ambiguous") {
      return {
        clarification: buildInventoryBatchItemAmbiguityClarification(parsed, itemName, match.candidates),
      };
    }
    if (!match.row || !["exact", "strong"].includes(match.type)) {
      return {
        clarification: buildInventoryBatchUnknownItemClarification(itemName, match.candidates || []),
      };
    }
    const resolvedUnit = resolveSafeExplicitRestockUnit({
      spokenUnit: parsed.unit,
      canonicalUnit: match.row.unit,
      quantity: parsed.quantity,
      genericRetailUnit: parsed.unit_is_generic_retail,
    });
    if (!resolvedUnit) {
      return {
        clarification: {
          question: `${match.row.item_name} 平時係用 ${formatInventoryUnitForUser(match.row.unit)} 計，今次你講「${parsed.raw_unit}」係咪即係 1 ${formatInventoryUnitForUser(match.row.unit)}？`,
          allow_free_text: true,
          choices: [],
        },
      };
    }
    items.push({
      item_id: match.row.item_id,
      item_name: match.row.item_name,
      unit: resolvedUnit,
      quantity: parsed.quantity,
    });
  }

  const seen = new Set();
  const deduped = [];
  for (const item of items) {
    const key = String(item.item_id || item.item_name || "").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }
  return { items: deduped };
}

function expandExplicitRestockItemNameFromClarification(itemName, answer) {
  const normalized = normalizeShoppingTaskMatchText(itemName);
  if (normalized !== "老醋") {
    return { itemNames: [itemName] };
  }

  const answerText = String(answer || "");
  const hasDarkSoy = /老抽/u.test(answerText);
  const hasVinegar = /(?:^|[^老])醋/u.test(answerText) || /醋係/u.test(answerText);
  if (hasDarkSoy && hasVinegar && /(兩個|两个|分別|分别|都|各)/u.test(answerText)) {
    return { itemNames: ["老抽", "醋"] };
  }
  if (hasDarkSoy && !hasVinegar) {
    return { itemNames: ["老抽"] };
  }
  if (hasVinegar && !hasDarkSoy) {
    return { itemNames: ["醋"] };
  }
  return {
    clarification: true,
    subject: itemName,
  };
}

function buildExplicitRestockBatchClarification(parsed, subject) {
  const quantityText = formatInventoryQuantityForUser(parsed.quantity);
  const question = `多比想問清楚，「${subject}」係想記「老抽」、「醋」，定兩樣都各 +${quantityText}？`;
  return {
    question,
    allow_free_text: true,
    choices: [
      {
        label: `老抽同醋都 +${quantityText}`,
        resume_text: `${parsed.original_text}\n老抽同醋兩個紀錄都分別 +${quantityText}`,
      },
      {
        label: `只係醋 +${quantityText}`,
        resume_text: `${parsed.original_text}\n只係醋 +${quantityText}`,
      },
      {
        label: `只係老抽 +${quantityText}`,
        resume_text: `${parsed.original_text}\n只係老抽 +${quantityText}`,
      },
    ],
  };
}

function buildInventoryBatchItemAmbiguityClarification(parsed, itemName, candidates = []) {
  const names = candidates.slice(0, 3).map((row) => row?.item_name).filter(Boolean);
  return {
    question: names.length > 0
      ? `多比見到「${itemName}」可能係：${names.join("、")}。你想用邊個？`
      : `多比未夠把握「${itemName}」係邊樣存貨，你可以講完整啲個名嗎？`,
    allow_free_text: true,
    choices: names.slice(0, 3).map((name) => ({
      label: name,
      resume_text: `${parsed.original_text}\n「${itemName}」即係「${name}」`,
    })),
  };
}

function buildInventoryBatchUnknownItemClarification(itemName, candidates = []) {
  const names = candidates.slice(0, 3).map((row) => row?.item_name).filter(Boolean);
  return {
    question: names.length > 0
      ? `多比暫時未見到「${itemName}」，但見到可能係：${names.join("、")}。你想用邊個？`
      : `多比暫時未見到「${itemName}」呢個現有存貨。今次係新物品，定係用咗另一個名？`,
    allow_free_text: true,
    choices: [],
  };
}

function parseExplicitShoppingTaskDoneRequest(userText) {
  const text = String(userText || "").trim().replace(/[。！!？?]+$/u, "");
  if (!text) return null;
  if (/^(啱啱|剛剛|刚刚|頭先|头先|啱先|啱啱買咗|剛剛買咗|刚刚买了)/u.test(text)) {
    return null;
  }
  const match = text.match(/^(.+?)(?:已經買咗|已经买了|已買|买完了|買完咗|買齊咗|買齊晒|買齊曬)(?:喇|啦)?$/u);
  if (!match) return null;
  const subject = normalizeShoppingTaskMatchText(match[1]);
  if (!subject) return null;
  return {
    subject,
  };
}

function parseLooseCountValue(value) {
  const text = String(value || "").trim();
  const numeric = Number(text);
  if (Number.isFinite(numeric)) {
    return numeric;
  }
  if (text === "半") return 0.5;
  const digits = {
    零: 0,
    一: 1,
    二: 2,
    兩: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
  };
  if (Object.prototype.hasOwnProperty.call(digits, text)) {
    return digits[text];
  }
  if (text === "十") return 10;
  const teen = text.match(/^十([一二兩三四五六七八九])$/u);
  if (teen) return 10 + digits[teen[1]];
  const tens = text.match(/^([一二兩三四五六七八九])十([一二兩三四五六七八九])?$/u);
  if (tens) {
    return digits[tens[1]] * 10 + (tens[2] ? digits[tens[2]] : 0);
  }
  return Number.NaN;
}

function resolveSafeExplicitConsumeUnit({ spokenUnit, canonicalUnit, quantity }) {
  const normalizedSpokenUnit = String(spokenUnit || "").trim();
  const normalizedCanonicalUnit = String(canonicalUnit || "").trim();
  if (!normalizedCanonicalUnit) return "";
  if (!normalizedSpokenUnit) return normalizedCanonicalUnit;
  if (normalizedSpokenUnit === normalizedCanonicalUnit) return normalizedCanonicalUnit;
  if (
    normalizedSpokenUnit === "piece"
    && Number.isFinite(quantity)
    && quantity > 0
    && ["piece", "pack", "box", "bottle", "can", "cup", "roll"].includes(normalizedCanonicalUnit)
  ) {
    return normalizedCanonicalUnit;
  }
  return "";
}

function resolveSafeExplicitRestockUnit({ spokenUnit, canonicalUnit, quantity, genericRetailUnit = false }) {
  const normalizedSpokenUnit = String(spokenUnit || "").trim();
  const normalizedCanonicalUnit = String(canonicalUnit || "").trim();
  if (!normalizedCanonicalUnit) return "";
  if (!normalizedSpokenUnit) return normalizedCanonicalUnit;
  if (normalizedSpokenUnit === normalizedCanonicalUnit) return normalizedCanonicalUnit;
  if (
    genericRetailUnit
    && Number.isFinite(quantity)
    && quantity === 1
    && ["piece", "pack", "box", "bottle", "can", "cup", "roll"].includes(normalizedCanonicalUnit)
  ) {
    return normalizedCanonicalUnit;
  }
  return "";
}

function extractOpenTaskRowsFromChatState(chatState) {
  const entities = Array.isArray(chatState?.last_result_entities)
    ? chatState.last_result_entities
    : [];
  const lastAction = normalizeLastSuccessfulAction(chatState?.last_successful_action);
  const actionSet = new Set(Array.isArray(lastAction?.actions) ? lastAction.actions : []);
  const isTaskQueryContext = ["query_tasks", "get_upcoming_tasks", "get_overdue_tasks"].some((action) => actionSet.has(action));
  if (!isTaskQueryContext) {
    return [];
  }
  return entities
    .map((entity) => normalizeResultEntity(entity))
    .filter((entity) => entity?.kind === "task" && normalizeTaskStatus(entity.status) === "open")
    .map((entity) => ({
      task_id: entity.entity_id,
      task_name: entity.name,
      status: entity.status,
      category: entity.category,
      due_at: entity.due_at,
    }));
}

function findUniqueShoppingTaskMatch(tasks, subject) {
  const rows = Array.isArray(tasks) ? tasks.filter(Boolean) : [];
  const normalizedSubject = normalizeShoppingTaskMatchText(subject);
  if (!normalizedSubject) return null;

  const exactMatches = rows.filter((task) => {
    const taskName = normalizeShoppingTaskMatchText(task?.task_name || task?.name || "");
    return taskName && taskName === normalizedSubject;
  });
  if (exactMatches.length === 1) {
    return exactMatches[0];
  }
  if (exactMatches.length > 1) {
    return null;
  }

  const containsMatches = rows.filter((task) => {
    const taskName = normalizeShoppingTaskMatchText(task?.task_name || task?.name || "");
    return taskName && (taskName.includes(normalizedSubject) || normalizedSubject.includes(taskName));
  });
  return containsMatches.length === 1 ? containsMatches[0] : null;
}

function normalizeShoppingTaskMatchText(value) {
  let text = String(value || "").trim();
  if (!text) return "";
  text = text
    .replace(/^[要去請幫記得之後今日今晚聽日明天遲啲]+/u, "")
    .replace(/^(?:去)?買/u, "")
    .replace(/(?:需要買|要買)$/u, "")
    .replace(/[「」"'`~。，、！？!?\s]/gu, "")
    .trim();
  return text;
}

function normalizeTaskStatus(value) {
  return String(value || "").trim().toLowerCase();
}

function buildDirectShoppingTaskDoneEnvelope(subject, matchedTask, updateExecutionEntry, successfulExecutions) {
  const taskName = String(matchedTask?.task_name || matchedTask?.name || subject || "").trim();
  return {
    status: "reply",
    reply_text: `已經幫你將「${taskName}」標記為完成喇。`,
    clarification: null,
    command_request: null,
    latest_successful_execution: updateExecutionEntry,
    successful_executions: successfulExecutions,
  };
}

function applyPersonaReplyStyle(text, { mode = "reply" } = {}) {
  const raw = String(text || "").trim();
  if (!raw) return raw;
  if (raw.includes(persona.firstPersonStyle)) {
    return raw;
  }

  if (mode === "clarify") {
    return `${persona.firstPersonStyle}想問清楚少少，${raw}`;
  }
  if (mode === "desktop_required") {
    return `${persona.firstPersonStyle}想同你講，${raw}`;
  }

  if (/\n/u.test(raw)) {
    return `${pickPersonaPrefix(raw)}：\n${raw}`;
  }
  return `${pickPersonaPrefix(raw)}，${raw}`;
}

function pickPersonaPrefix(text) {
  const normalized = String(text || "");
  if (/已經|記低|處理好|幫你提|剩返|完成/u.test(normalized)) {
    return `${persona.firstPersonStyle}已經幫你處理好喇`;
  }
  if (/提醒|提你|到鐘|due|task/u.test(normalized)) {
    return `${persona.firstPersonStyle}提提你`;
  }
  return `${persona.firstPersonStyle}幫你睇到`;
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
  if (!options.provider || !options.model || options.modelReasoningEffort !== "medium") {
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

  const explicitConsume = parseExplicitInventoryConsumeRequest("食咗一個乳酪");
  if (
    !explicitConsume
    || explicitConsume.item_name !== "乳酪"
    || explicitConsume.quantity !== 1
    || explicitConsume.unit !== "個"
  ) {
    throw new Error("Bridge self-test failed: explicit inventory consume parsing is invalid.");
  }
  const explicitConsumeBatch = parseExplicitInventoryConsumeRequest("食咗一個公仔麵，同一隻雞蛋");
  if (
    !explicitConsumeBatch
    || !Array.isArray(explicitConsumeBatch.items)
    || explicitConsumeBatch.items.length !== 2
    || explicitConsumeBatch.items[0].item_name !== "公仔麵"
    || explicitConsumeBatch.items[0].unit !== "個"
    || explicitConsumeBatch.items[1].item_name !== "雞蛋"
    || explicitConsumeBatch.items[1].unit !== "隻"
  ) {
    throw new Error("Bridge self-test failed: explicit inventory batch consume parsing is invalid.");
  }
  if (resolveSafeExplicitConsumeUnit({ spokenUnit: "piece", canonicalUnit: "cup", quantity: 1 }) !== "cup") {
    throw new Error("Bridge self-test failed: generic count-word unit alignment is invalid.");
  }
  if (resolveSafeExplicitConsumeUnit({ spokenUnit: "box", canonicalUnit: "bottle", quantity: 1 }) !== "") {
    throw new Error("Bridge self-test failed: unsafe inventory unit alignment should be rejected.");
  }
  const explicitShoppingDone = parseExplicitShoppingTaskDoneRequest("廁所墊同乾洗頭水已經買咗");
  if (!explicitShoppingDone || explicitShoppingDone.subject !== "廁所墊同乾洗頭水") {
    throw new Error("Bridge self-test failed: explicit shopping task completion parsing is invalid.");
  }
  if (parseExplicitShoppingTaskDoneRequest("啱啱買咗盒牛奶")) {
    throw new Error("Bridge self-test failed: purchase logging text should not be treated as task completion.");
  }
  if (normalizeShoppingTaskMatchText("買 廁所墊同乾洗頭水") !== "廁所墊同乾洗頭水") {
    throw new Error("Bridge self-test failed: shopping task match normalization is invalid.");
  }

  const originalExecuteBridgeCommandForShoppingDone = bridge.executeBridgeCommand;
  let shoppingDoneUpdateSeen = false;
  bridge.executeBridgeCommand = (commandRequest) => {
    if (commandRequest?.argv?.[0] === "update_task") {
      shoppingDoneUpdateSeen = true;
      return {
        ok: true,
        command_id: "bb_inventory_api",
        exit_code: 0,
        stdout: "",
        stderr: "",
        parsed_json: {
          action: "update_task",
          result: {
            task_id: "tsk_done_1",
            task_name: "買廁所墊同乾洗頭水",
            status: "done",
            category: "home",
          },
        },
        error: "",
      };
    }
    return {
      ok: false,
      command_id: "bb_inventory_api",
      exit_code: 1,
      stdout: "",
      stderr: "",
      parsed_json: null,
      error: "Unexpected command in shopping-done self-test.",
    };
  };
  const shoppingDoneEnvelope = bridge.tryDirectExplicitShoppingTaskDoneTurn(
    "廁所墊同乾洗頭水已經買咗",
    normalizeChatState({
      last_successful_action: {
        actions: ["query_tasks"],
        source_user_text: "有什麼東西要買？",
        created_at: new Date().toISOString(),
      },
      last_result_entities: [{
        kind: "task",
        entity_id: "tsk_done_1",
        name: "買廁所墊同乾洗頭水",
        status: "open",
        category: "home",
      }],
    }),
  );
  bridge.executeBridgeCommand = originalExecuteBridgeCommandForShoppingDone;
  if (
    !shoppingDoneEnvelope
    || !shoppingDoneUpdateSeen
    || shoppingDoneEnvelope.latest_successful_execution?.execution?.parsed_json?.result?.status !== "done"
  ) {
    throw new Error("Bridge self-test failed: deterministic shopping task completion fallback is invalid.");
  }

  const originalExecuteBridgeCommandForMemory = bridge.executeBridgeCommand;
  let memoryWriteSeen = false;
  let memoryQuerySeen = false;
  bridge.executeBridgeCommand = (commandRequest) => {
    const action = commandRequest?.argv?.[0];
    if (action === "append_household_memory") {
      const payload = JSON.parse(commandRequest.argv[commandRequest.argv.indexOf("--payload-json") + 1]);
      memoryWriteSeen = payload.subject === "成長椅嘅工具" && payload.location === "工具箱";
      return {
        ok: true,
        command_id: "bb_inventory_api",
        exit_code: 0,
        stdout: "",
        stderr: "",
        parsed_json: {
          action,
          result: {
            memory_id: "mem_test_1",
            memory_type: "item_location",
            subject: payload.subject,
            location: payload.location,
            status: "active",
          },
        },
        error: "",
      };
    }
    if (action === "query_household_memory") {
      const payload = JSON.parse(commandRequest.argv[commandRequest.argv.indexOf("--payload-json") + 1]);
      memoryQuerySeen = payload.subject === "成長椅嘅工具";
      return {
        ok: true,
        command_id: "bb_inventory_api",
        exit_code: 0,
        stdout: "",
        stderr: "",
        parsed_json: {
          action,
          result: [{
            memory_id: "mem_test_1",
            memory_type: "item_location",
            subject: "成長椅嘅工具",
            location: "工具箱",
            status: "active",
          }],
        },
        error: "",
      };
    }
    return {
      ok: false,
      command_id: "bb_inventory_api",
      exit_code: 1,
      stdout: "",
      stderr: "",
      parsed_json: null,
      error: "Unexpected command in memory self-test.",
    };
  };
  const memorySaveEnvelope = bridge.tryDirectHouseholdMemoryTurn("幫我記住成長椅嘅工具 放咗喺工具箱");
  const memoryQueryEnvelope = bridge.tryDirectHouseholdMemoryTurn("成長椅嘅工具放咗去邊");
  bridge.executeBridgeCommand = originalExecuteBridgeCommandForMemory;
  if (
    !memoryWriteSeen
    || !memoryQuerySeen
    || memorySaveEnvelope?.status !== "reply"
    || memoryQueryEnvelope?.status !== "reply"
    || !memoryQueryEnvelope.reply_text.includes("工具箱")
  ) {
    throw new Error("Bridge self-test failed: Dobby Intelligence household memory deterministic path is invalid.");
  }

  const originalExecuteBridgeCommandForSafetyStock = bridge.executeBridgeCommand;
  let safetyStockUpdateSeen = false;
  bridge.executeBridgeCommand = (commandRequest) => {
    const action = commandRequest?.argv?.[0];
    if (action === "get_inventory_snapshot") {
      return {
        ok: true,
        command_id: "bb_inventory_api",
        exit_code: 0,
        stdout: "",
        stderr: "",
        parsed_json: {
          action,
          result: [{
            item_id: "itm_white_pepper",
            item_name: "白胡椒粉",
            unit: "bottle",
            category: "groceries",
            quantity_on_hand: 1,
            safety_stock: 0,
          }],
        },
        error: "",
      };
    }
    if (action === "upsert_inventory_item") {
      const payload = JSON.parse(commandRequest.argv[commandRequest.argv.indexOf("--payload-json") + 1]);
      safetyStockUpdateSeen = payload.item_id === "itm_white_pepper" && payload.safety_stock === 1;
      return {
        ok: true,
        command_id: "bb_inventory_api",
        exit_code: 0,
        stdout: "",
        stderr: "",
        parsed_json: {
          action,
          result: {
            item_id: payload.item_id,
            item_name: payload.item_name,
            unit: payload.unit,
            safety_stock: payload.safety_stock,
          },
        },
        error: "",
      };
    }
    return {
      ok: false,
      command_id: "bb_inventory_api",
      exit_code: 1,
      stdout: "",
      stderr: "",
      parsed_json: null,
      error: "Unexpected command in safety-stock self-test.",
    };
  };
  const safetyStockEnvelope = bridge.tryDirectInventorySafetyStockTurn("幫我設定返白胡椒粉嘅安全存量係一樽");
  bridge.executeBridgeCommand = originalExecuteBridgeCommandForSafetyStock;
  if (
    !safetyStockUpdateSeen
    || safetyStockEnvelope?.status !== "reply"
    || !safetyStockEnvelope.reply_text.includes("白胡椒粉")
  ) {
    throw new Error("Bridge self-test failed: Dobby Intelligence safety-stock deterministic path is invalid.");
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
    !clarifyReply.text
    || !resumeContext
    || resumeContext.original_user_text !== "記錯咗 冇食到 幫我加返一包"
    || !/Pending clarification question: 係邊樣嘢要加返 1 包？/.test(resumedPrompt)
    || !/Original Telegram user message: 記錯咗 冇食到 幫我加返一包/.test(resumedPrompt)
  ) {
    throw new Error("Bridge self-test failed: free-text clarification resume context is invalid.");
  }

  const stitchedClarificationInput = buildClarificationResumeInput({
    pendingClarification: {
      question: "請問「白胡椒粉」屬於邊一類？",
      allow_free_text: true,
      original_user_text: "加入白胡椒粉到存貨，唔設定數量",
      last_reply_text: "請問「白胡椒粉」屬於邊一類？",
    },
    answerText: "調味料",
    suggestedResumeText: "白胡椒粉分類係調味料。",
  });
  if (
    !/Original request: 加入白胡椒粉到存貨，唔設定數量/.test(stitchedClarificationInput)
    || !/Clarification answer: 調味料/.test(stitchedClarificationInput)
    || !/Suggested resolved request: 白胡椒粉分類係調味料。/.test(stitchedClarificationInput)
  ) {
    throw new Error("Bridge self-test failed: clarification stitching is invalid.");
  }

  let capturedResumeTurn = null;
  const callbackBridge = new CodexBridge({ workspace: bridge.workspace });
  callbackBridge.saveState = () => {};
  callbackBridge.state = normalizeBridgeState({
    chats: {
      callback_chat: {
        thread_id: "thread_callback",
        pending_choices: [{
          token: "cb_choice",
          label: "調味料",
          resume_text: "白胡椒粉分類係調味料。",
          created_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 60000).toISOString(),
        }],
        pending_clarification: {
          question: "請問「白胡椒粉」屬於邊一類？",
          allow_free_text: true,
          original_user_text: "加入白胡椒粉到存貨，唔設定數量",
          last_reply_text: "請問「白胡椒粉」屬於邊一類？",
          created_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 60000).toISOString(),
        },
      },
    },
  });
  callbackBridge.runChatTurn = async (stateKey, userText, telegramUserId, options) => {
    capturedResumeTurn = { stateKey, userText, telegramUserId, options };
    return { text: "ok", reply_markup: null };
  };
  await callbackBridge.resumeFromCallback("callback_chat", "cb_choice", { telegramUserId: "42" });
  if (
    !capturedResumeTurn
    || capturedResumeTurn.stateKey !== "callback_chat"
    || capturedResumeTurn.options?.transcriptUserText !== "[button] 調味料"
    || !/Original request: 加入白胡椒粉到存貨，唔設定數量/.test(capturedResumeTurn.userText)
    || !/Clarification answer: 調味料/.test(capturedResumeTurn.userText)
    || !/Suggested resolved request: 白胡椒粉分類係調味料。/.test(capturedResumeTurn.userText)
  ) {
    throw new Error("Bridge self-test failed: callback clarification stitching is invalid.");
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
  const intelligencePrompt = bridge.buildFamilyOsAgentPrompt("成長椅嘅工具喺邊", "7476829331", chatState, null);
  if (
    !/Dobby Intelligence Layer v1 context packet/.test(intelligencePrompt)
    || !/likely_domain: household_memory/.test(intelligencePrompt)
  ) {
    throw new Error("Bridge self-test failed: Dobby Intelligence context packet is invalid.");
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
    changes: [{ path: path.join(bridge.runtimeKnowledgeRoot, "learned-knowledge.json"), kind: "update" }],
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

  console.log(`Family OS Bridge self-test passed (${options.provider}).`);
}
