import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Codex } from "@openai/codex-sdk";

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

const codex = new Codex();
const thread = codex.startThread({
  workingDirectory: workspace,
  skipGitRepoCheck: true,
  sandboxMode: "workspace-write",
  approvalPolicy: "never",
  networkAccessEnabled: true,
  webSearchMode: "disabled",
  modelReasoningEffort: "low",
});
const result = await thread.run([
  "This is a read-only Family OS validation turn.",
  "Follow the workspace AGENTS.md and use the configured Family OS skills.",
  "Answer the user question by reading the live Family OS data. Do not modify any data.",
  "Reply in concise Cantonese.",
  "<user_message>",
  "而家有幾多 stock？",
  "</user_message>",
].join("\n"));
console.log("Family OS SDK live test passed.");
console.log(result.finalResponse);

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
