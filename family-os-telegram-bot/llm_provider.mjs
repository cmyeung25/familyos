import fs from "node:fs";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Codex } from "@openai/codex-sdk";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
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
const defaultCodexModel = "gpt-5.4";
const defaultDeepSeekModel = "deepseek-v4-flash";

export function createLlmProvider({ workspace }) {
  const options = buildLlmRunOptions(workspace);
  if (options.provider === "deepseek") {
    return new DeepSeekProvider({ options });
  }
  return new CodexLlmProvider({ options });
}

export function buildLlmRunOptions(workspace) {
  const provider = resolveLlmProviderName();
  const configuredModel = String(
    process.env.FAMILY_OS_LLM_MODEL
      || process.env.FAMILY_OS_AGENT_MODEL
      || "",
  ).trim();
  return {
    provider,
    model: configuredModel || (provider === "deepseek" ? defaultDeepSeekModel : defaultCodexModel),
    workingDirectory: workspace,
    skipGitRepoCheck: true,
    sandboxMode: "workspace-write",
    approvalPolicy: "never",
    networkAccessEnabled: true,
    webSearchMode: "disabled",
    modelReasoningEffort: "medium",
  };
}

export function resolveLlmProviderName() {
  const raw = String(process.env.FAMILY_OS_LLM_PROVIDER || "codex").trim().toLowerCase();
  if (raw === "deepseek") {
    return "deepseek";
  }
  return "codex";
}

class CodexLlmProvider {
  constructor({ options }) {
    this.options = { ...options };
    this.codex = new Codex();
  }

  usesPersistentSessions() {
    return true;
  }

  getRunOptions() {
    return { ...this.options };
  }

  openSession({ sessionId = "" } = {}) {
    if (sessionId) {
      return this.codex.resumeThread(sessionId, this.options);
    }
    return this.codex.startThread(this.options);
  }

  getSessionId(session) {
    return String(session?.id || "");
  }

  health({ requireLogin = true } = {}) {
    const login = readCodexLoginStatus();
    const codexHome = process.env.CODEX_HOME
      ? path.resolve(process.env.CODEX_HOME)
      : path.join(os.homedir(), ".codex");
    return {
      provider: "codex",
      authMode: "codex_login",
      ok: !requireLogin || login.ok,
      message: login.message,
      checks: {
        auth_cache_present: fs.existsSync(path.join(codexHome, "auth.json")),
      },
    };
  }

  notReadyMessage() {
    return "Family OS Bridge is not ready. Sign in to Codex in this session and sync the BB + inventory + task V2 skills.";
  }

  async runStructuredTurn(session, prompt, { signal, outputSchema, validateItem }) {
    const itemsById = new Map();
    let finalResponse = "";
    let usage = null;

    const { events } = await session.runStreamed(prompt, {
      signal,
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

      const boundary = validateItem(item);
      if (!boundary.ok) {
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
  }
}

class DeepSeekProvider {
  constructor({ options }) {
    this.options = { ...options };
    this.baseUrl = trimTrailingSlash(
      String(
        process.env.FAMILY_OS_LLM_BASE_URL
          || process.env.DEEPSEEK_API_BASE_URL
          || "https://api.deepseek.com",
      ).trim(),
    );
    this.apiKey = String(
      process.env.FAMILY_OS_LLM_API_KEY
        || process.env.DEEPSEEK_API_KEY
        || "",
    ).trim();
  }

  usesPersistentSessions() {
    return false;
  }

  getRunOptions() {
    return {
      ...this.options,
      baseUrl: this.baseUrl,
    };
  }

  openSession() {
    return { id: "" };
  }

  getSessionId() {
    return "";
  }

  health({ requireLogin = true } = {}) {
    const hasApiKey = Boolean(this.apiKey);
    return {
      provider: "deepseek",
      authMode: "deepseek_api_key",
      ok: !requireLogin || hasApiKey,
      message: hasApiKey ? "DeepSeek API key configured." : "DeepSeek API key is missing.",
      checks: {
        api_key_configured: hasApiKey,
        api_base_url: this.baseUrl,
      },
    };
  }

  notReadyMessage() {
    return "Family OS Bridge is not ready. Set FAMILY_OS_LLM_PROVIDER=deepseek and provide DEEPSEEK_API_KEY, then restart the bot.";
  }

  async runStructuredTurn(_session, prompt, { signal, outputSchema }) {
    if (!this.apiKey) {
      throw new Error("DeepSeek API key is not configured.");
    }
    if (typeof fetch !== "function") {
      throw new Error("This Node runtime does not provide fetch, so DeepSeek API mode is unavailable.");
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.options.model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: [
              "You are the Family OS Telegram bridge reasoning model.",
              "Return exactly one JSON object and do not wrap it in markdown.",
              "Follow this JSON schema:",
              JSON.stringify(outputSchema),
            ].join("\n"),
          },
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
      signal,
    });

    const responseText = await response.text();
    let data = null;
    try {
      data = JSON.parse(responseText);
    } catch {
      throw new Error(`DeepSeek API returned non-JSON (${response.status}).`);
    }

    if (!response.ok) {
      const message = extractDeepSeekErrorMessage(data) || `DeepSeek API failed (${response.status}).`;
      throw new Error(message);
    }

    const finalResponse = extractAssistantText(data);
    if (!finalResponse) {
      throw new Error("DeepSeek API returned no assistant content.");
    }

    return {
      finalResponse,
      usage: data?.usage || null,
      items: [],
    };
  }
}

function extractAssistantText(data) {
  const choice = Array.isArray(data?.choices) ? data.choices[0] : null;
  const content = choice?.message?.content;
  if (typeof content === "string") {
    return content.trim();
  }
  if (Array.isArray(content)) {
    return content
      .map((entry) => (typeof entry?.text === "string" ? entry.text : ""))
      .join("")
      .trim();
  }
  return "";
}

function extractDeepSeekErrorMessage(data) {
  if (typeof data?.error?.message === "string" && data.error.message.trim()) {
    return data.error.message.trim();
  }
  return "";
}

function trimTrailingSlash(value) {
  return String(value || "").replace(/\/+$/u, "");
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
